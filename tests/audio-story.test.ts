import { beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Db } from "@/db/client";
import { freshEnv } from "./helpers";
import { saveAudio } from "@/lib/audio";
import { saveAsset, getAsset } from "@/lib/assets";
import { addReference, createCharacter } from "@/lib/characters";
import { alignPieces, analyzeStory, createStoryProject, matchVerb, setSceneVisual, splitShots } from "@/lib/audio-story";
import { listScenes } from "@/lib/scenes";
import { exportDraftVideo } from "@/lib/studio";
import { hasFfmpeg } from "@/lib/ffmpeg";

let db: Db, ws: string, dir: string;
beforeEach(async () => { ({ db, workspaceId: ws, storageDir: dir } = await freshEnv()); });

const TEXT = "ذهبت سالمة إلى المخبز. اشترت الخبز الطازج ثم عادت إلى البيت. جلست سالمة في المطبخ وشربت اللبن، وكانت سعيدة.";
/** A "reading" with pauses between phrases: speech 2.0 | .6 | 1.4 | .5 | 1.2 | .6 | 1.8 | .5 | 1.6 */
function reading() {
  const parts = [[2, 1], [0.6, 0], [1.4, 1], [0.5, 0], [1.2, 1], [0.6, 0], [1.8, 1], [0.5, 0], [1.6, 1]];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rd-"));
  const files = parts.map(([d, on], i) => {
    const f = path.join(tmp, `${i}.wav`);
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", on ? `sine=frequency=${300 + i * 40}:duration=${d}` : `anullsrc=r=44100:cl=mono`, "-t", String(d), "-ar", "44100", "-ac", "1", f]);
    return f;
  });
  fs.writeFileSync(path.join(tmp, "l.txt"), files.map((f) => `file '${f}'`).join("\n"));
  return new Uint8Array(execFileSync("ffmpeg", ["-v", "error", "-f", "concat", "-safe", "0", "-i", path.join(tmp, "l.txt"), "-f", "wav", "-"], { maxBuffer: 1 << 26 }));
}
const clip = () => new Uint8Array(execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=25:duration=2", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-movflags", "frag_keyframe+empty_moov", "-f", "mp4", "-"], { maxBuffer: 1 << 26 }));
const png = (c = "orange") => new Uint8Array(execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", `color=c=${c}:s=320x240`, "-frames:v", "1", "-f", "image2pipe", "-c:v", "png", "-"]));

describe("audio-to-video: text analysis", () => {
  it("matches verbs strictly (names and nouns never match)", () => {
    expect(matchVerb("ذهبت")?.feminine).toBe(true);
    expect(matchVerb("يشرب")?.feminine).toBe(false);
    expect(matchVerb("وشربت")).not.toBeNull();
    expect(matchVerb("اشترت")).not.toBeNull();
    expect(matchVerb("سالمة")).toBeNull();
    expect(matchVerb("عادة")).toBeNull();
    expect(matchVerb("الخبز")).toBeNull();
  });

  it("splits a sentence into one shot per action", () => {
    expect(splitShots("اشترت الخبز الطازج ثم عادت إلى البيت.")).toEqual(["اشترت الخبز الطازج", "ثم عادت إلى البيت."]);
    expect(splitShots("جلست سالمة في المطبخ وشربت اللبن، وكانت سعيدة.")).toEqual(["جلست سالمة في المطبخ", "وشربت اللبن، وكانت سعيدة."]);
  });

  it("snaps shot boundaries to the reader's pauses", () => {
    const { timing, spans } = alignPieces(["أ ب ج د", "هـ و ز"], 5, [[2.4, 2.8]]);
    expect(timing).toBe("pauses");
    expect(spans).toEqual([[0, 2.6], [2.6, 5]]);
  });
});

describe("audio-to-video: from a narrator recording to a synced video of existing assets", () => {
  it("analyses, times, picks assets, builds shots and exports with the narrator voice", async () => {
    if (!(await hasFfmpeg())) return;
    const audio = await saveAudio(db, { workspaceId: ws, name: "فقرة 1", type: "audio/wav", bytes: reading(), origin: "upload", speaker: "منجية", consent: true });
    const salma = await createCharacter(db, ws, { name: "سالمة" });
    const face = await saveAsset(db, { workspaceId: ws, source: "upload", name: "salma.png", mimeType: "image/png", bytes: png() });
    await addReference(db, salma.id, face.id, "primary");
    const video = await saveAsset(db, { workspaceId: ws, source: "upload", name: "سالمة تشرب اللبن.mp4", mimeType: "video/mp4", bytes: clip() });
    const bakery = await saveAsset(db, { workspaceId: ws, source: "upload", name: "المخبز.png", mimeType: "image/png", bytes: png("brown") });

    const a = await analyzeStory(db, { workspaceId: ws, audioAssetId: audio.id, transcript: TEXT });
    const shots = a.scenes.flatMap((s) => s.shots);
    expect(a.timing).toBe("pauses");
    expect(shots.map((s) => s.text)).toEqual(["ذهبت سالمة إلى المخبز.", "اشترت الخبز الطازج", "ثم عادت إلى البيت.", "جلست سالمة في المطبخ", "وشربت اللبن، وكانت سعيدة."]);
    // Boundaries fall in the middle of the pauses.
    expect(shots.map((s) => s.start)).toEqual([0, 2.3, 4.25, 6, 8.35]);
    expect(shots.at(-1)!.end).toBeCloseTo(10.2, 1);
    expect(a.characters.map((c) => c.name)).toEqual(["سالمة"]);
    expect(a.places).toEqual(["المخبز", "البيت", "المطبخ"]);
    expect(a.scenes.map((s) => s.shots.length)).toEqual([2, 1, 2]);
    expect(shots[0].actions[0].motion).toBe("سالمة تمشي متجهةً إلى المخبز");
    expect(shots[1].inferredCharacter).toBe(true);
    expect(shots[1].actions[0].motion).toContain("تشتري الخبز");
    expect(shots[4].expression).toBe("سعيدة");
    for (const s of shots) for (const act of s.actions) expect(act.at).toBeGreaterThanOrEqual(s.start);
    // No lip movement, ever: the voice is the narrator's.
    expect(shots.every((s) => s.motionPrompt.includes("لا كلام ولا حركة شفاه"))).toBe(true);
    // Assets: the bakery picture, the ready clip for drinking milk, Salma's picture otherwise.
    expect(shots.map((s) => s.asset.kind)).toEqual(["image", "image", "character", "character", "clip"]);
    expect(shots[0].asset.assetId).toBe(bakery.id);
    expect(shots[4].asset.assetId).toBe(video.id);
    // Nothing is invented: every motion comes from a verb in the text.
    expect(shots.flatMap((s) => s.actions.map((x) => x.verb))).toEqual(["ذهبت", "اشترت", "عادت", "جلست", "وشربت"]);

    const pid = await createStoryProject(db, { workspaceId: ws, analysis: a });
    const scenes = await listScenes(db, pid);
    expect(scenes.length).toBe(5);
    expect(scenes.every((s) => s.audio_asset_id === audio.id)).toBe(true);
    expect(scenes.map((s) => Number(s.audio_trim_start))).toEqual([0, 2.3, 4.25, 6, 8.35]);
    expect(scenes[4].video_asset_id).toBe(video.id);
    expect(scenes[4].preview_asset_id).not.toBeNull();
    const jobs = await db.query(`select 1 from generation_jobs where type='scene.preview'`);
    expect(jobs.length).toBe(0); // every shot used an existing asset: nothing generated

    const out = await exportDraftVideo(db, pid, { captions: true });
    const file = `${dir}/${(await getAsset(db, String(out.job.output!.assetId)))!.storage_key}`;
    const info = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", file]).toString());
    expect(Math.abs(Number(info.format.duration) - 10.2)).toBeLessThan(0.3);
    expect(info.streams.map((s: { codec_type: string }) => s.codec_type).sort()).toEqual(["audio", "video"]);

    // Manual change: swap a shot to the clip, then back to a placeholder (marked, free).
    await setSceneVisual(db, scenes[3].id, video.id);
    expect((await listScenes(db, pid))[3].visual_source).toBe("clip");
    await setSceneVisual(db, scenes[3].id, null);
    expect((await listScenes(db, pid))[3].visual_source).toBe("placeholder");
  }, 180000);
});
