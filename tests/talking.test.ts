import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { freshEnv } from "./helpers";
import { addReference, createCharacter, updateVoice } from "@/lib/characters";
import { applyPronunciation, talkingPhoto } from "@/lib/talking";
import { saveAsset, getAsset } from "@/lib/assets";
import { placeholderSvg } from "@/providers/mock/image";
import { mockSpeechWav } from "@/providers/mock/voice";
import { hasFfmpeg } from "@/lib/ffmpeg";
import { spendSummary } from "@/lib/cost";

let db: Db;
let ws: string;
beforeEach(async () => {
  ({ db, workspaceId: ws } = await freshEnv());
});

const face = async () => (await saveAsset(db, {
  workspaceId: ws, source: "upload", name: "face.svg", mimeType: "image/svg+xml",
  bytes: new TextEncoder().encode(placeholderSvg({ width: 320, height: 400, label: "سالمة", prompt: "x", seed: "f" })),
})).id;

describe("talking photo", () => {
  it("uses the character's primary image and saved voice, and reuses identical requests", async () => {
    if (!(await hasFfmpeg())) return;
    const c = await createCharacter(db, ws, { name: "سالمة" });
    const img = await face();
    await addReference(db, c.id, img);
    await updateVoice(db, c.id, { dialect: "omani", speed: 1.2 });
    const r1 = await talkingPhoto(db, { workspaceId: ws, characterId: c.id, text: "مَرْحَبًا يا أَصْدِقائي" });
    expect(r1.imageAssetId).toBe(img);
    expect(r1.voice.speed).toBe(1.2);
    expect(r1.voiceOut?.dialectUsed).toBeNull(); // mock voice declares no dialects: never claimed
    expect((await getAsset(db, r1.videoAssetId))?.mime_type).toBe("video/mp4");
    const r2 = await talkingPhoto(db, { workspaceId: ws, characterId: c.id, text: "مَرْحَبًا يا أَصْدِقائي" });
    expect(r2.videoAssetId).toBe(r1.videoAssetId);
    expect(r2.reused).toBe(true);
    const calls = await db.query<{ n: number }>(`select count(*)::int n from provider_calls`);
    expect(calls[0].n).toBe(2); // one voice + one avatar, not four
    expect((await spendSummary(db, { workspaceId: ws })).totalUsd).toBe(0);
  }, 60000);

  it("accepts uploaded audio as is, and explains missing inputs", async () => {
    if (!(await hasFfmpeg())) return;
    const img = await face();
    const wav = mockSpeechWav("تسجيل من المعلمة");
    const audio = await saveAsset(db, { workspaceId: ws, source: "upload", name: "rec.wav", mimeType: "audio/wav", bytes: wav.bytes });
    const r = await talkingPhoto(db, { workspaceId: ws, imageAssetId: img, audioAssetId: audio.id });
    expect(r.audioAssetId).toBe(audio.id);
    const c = await createCharacter(db, ws, { name: "بلا صورة" });
    await expect(talkingPhoto(db, { workspaceId: ws, characterId: c.id, text: "مرحبا" })).rejects.toThrow(/صورة/);
    await expect(talkingPhoto(db, { workspaceId: ws, imageAssetId: img, text: "  " })).rejects.toThrow(/النص/);
  }, 60000);

  it("applies the pronunciation dictionary on whole words only", async () => {
    await db.query(`insert into pronunciation_entries(workspace_id, term, pronunciation) values ($1,'سالمة','سَالِمَة')`, [ws]);
    expect(await applyPronunciation(db, ws, "أنا سالمة، وهذه سالمةُ؟")).toBe("أنا سَالِمَة، وهذه سالمةُ؟");
  });

  it("strips mime parameters from recorded audio", async () => {
    const a = await saveAsset(db, { workspaceId: ws, source: "upload", name: "r", mimeType: "audio/webm;codecs=opus", bytes: new Uint8Array([1, 2, 3]) });
    expect(a.mime_type).toBe("audio/webm");
  });
});
