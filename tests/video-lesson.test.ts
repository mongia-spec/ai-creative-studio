import { beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import type { Db } from "@/db/client";
import { freshEnv } from "./helpers";
import { createCharacter } from "@/lib/characters";
import { addInteraction, createVideoLesson, interactionStats, listVoiceAnswers, respond, respondVoice } from "@/lib/interactive";
import { askCharacter } from "@/lib/conversation";
import { hasFfmpeg } from "@/lib/ffmpeg";

let db: Db, ws: string;
beforeEach(async () => { ({ db, workspaceId: ws } = await freshEnv()); });

const ff = (args: string[]) => new Uint8Array(execFileSync("ffmpeg", ["-v", "error", ...args]));
const STORY = "نهضت سالمة مع خيوط الفجر الأولى والناس نيام. أطفأت القناديل وأشعلت شيئًا من البخور. رفعت فوق رأسها إناءً معدنيًا يسمّى الهاندوة، ومشت إلى النبع النظيف. خلطت الطحين بالملح والماء وخبزت الخبز الرقيق على الطوبج.";

describe("interactive lesson from a finished video", () => {
  it("keeps the video, places spoken questions by second, stores answers and lets the character answer from the story", async () => {
    if (!(await hasFfmpeg())) return;
    const video = ff(["-f", "lavfi", "-i", "testsrc=s=320x180:d=12", "-f", "lavfi", "-i", "sine=d=12", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "frag_keyframe+empty_moov", "-f", "mp4", "-"]);
    const salma = await createCharacter(db, ws, { name: "سالمة", description: "امرأة عمانية" });
    const r = await createVideoLesson(db, { workspaceId: ws, title: "صباح سالمة", bytes: video, mimeType: "video/mp4", characterId: salma.id, storyText: STORY });
    expect(r.durationSec).toBeGreaterThan(11);
    const [p] = await db.query<{ source_video_asset_id: string }>(`select source_video_asset_id from projects where id=$1`, [r.projectId]);
    expect(p.source_video_asset_id).toBe(r.videoAssetId);

    const q = await addInteraction(db, r.sceneId, { kind: "voice", atSec: 10.5, prompt: "ماذا تسمّى الإناء الذي حملته سالمة؟", choices: [{ label: "", feedback: "الهاندوة" }] });
    expect(q.choices).toEqual([{ label: "إجابة نموذجية", feedback: "الهاندوة" }]);
    await expect(respond(db, q.id, 0)).rejects.toThrow("بالتسجيل");
    await expect(addInteraction(db, r.sceneId, { kind: "voice", atSec: 99, prompt: "x", choices: [] })).rejects.toThrow("داخل مدة");

    // Browser recordings arrive as WebM/Opus and are kept as M4A for every phone.
    const answer = ff(["-f", "lavfi", "-i", "sine=f=300:d=2", "-c:a", "libopus", "-f", "webm", "-"]);
    const res = await respondVoice(db, q.id, { bytes: answer, type: "audio/webm;codecs=opus" });
    expect(res.modelAnswer).toBe("الهاندوة");
    const list = await listVoiceAnswers(db, r.projectId);
    expect(list).toHaveLength(1);
    const [a] = await db.query<{ mime_type: string }>(`select mime_type from assets where id=$1`, [list[0].audio_asset_id]);
    expect(a.mime_type).toBe("audio/mp4");
    expect((await interactionStats(db, r.projectId))[0].answers).toBe(1);

    const ask = await askCharacter(db, { characterId: salma.id, question: "ماذا حملت سالمة فوق رأسها؟", tier: "text", channel: "player", projectId: r.projectId });
    expect(ask.inScope).toBe(true);
    expect(ask.answer).toContain("الهاندوة");
  }, 60000);
});
