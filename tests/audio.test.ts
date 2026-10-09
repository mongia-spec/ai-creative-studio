import { beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import type { Db } from "@/db/client";
import { freshEnv } from "./helpers";
import { createProject } from "@/lib/projects";
import { exportDraftVideo, generateScript } from "@/lib/studio";
import { listScenes, updateScene } from "@/lib/scenes";
import { setSceneMedia } from "@/lib/production";
import { getAsset } from "@/lib/assets";
import { deleteAudio, listAudio, resolveAudioMime, saveAudio, setCharacterVoiceSample, setSceneAudioEdit } from "@/lib/audio";
import { createCharacter } from "@/lib/characters";
import { talkingPhoto } from "@/lib/talking";
import { hasFfmpeg } from "@/lib/ffmpeg";
import { placeholderSvg } from "@/providers/mock/image";
import { saveAsset } from "@/lib/assets";

let db: Db, ws: string, dir: string;
beforeEach(async () => { ({ db, workspaceId: ws, storageDir: dir } = await freshEnv()); });

/** A real encoded file, like a browser or phone would produce. */
function tone(fmt: "webm" | "m4a" | "mp3" | "wav", sec = 2, freq = 440) {
  const args = { webm: ["-c:a", "libopus", "-f", "webm"], m4a: ["-c:a", "aac", "-movflags", "frag_keyframe+empty_moov", "-f", "ipod"], mp3: ["-c:a", "libmp3lame", "-f", "mp3"], wav: ["-f", "wav"] }[fmt];
  return new Uint8Array(execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", `sine=frequency=${freq}:duration=${sec}`, ...args, "-"], { maxBuffer: 1 << 26 }));
}
const save = (bytes: Uint8Array, type: string, name: string, extra: Partial<Parameters<typeof saveAudio>[1]> = {}) =>
  saveAudio(db, { workspaceId: ws, name, type, bytes, origin: "upload", speaker: "منجية", consent: true, ...extra });

describe("audio library: real recordings and uploads", () => {
  it("resolves phone/browser mime names and file extensions", () => {
    expect(resolveAudioMime("audio/x-m4a", "a.m4a")).toBe("audio/mp4");
    expect(resolveAudioMime("audio/mp3", "a.mp3")).toBe("audio/mpeg");
    expect(resolveAudioMime("", "voice.M4A")).toBe("audio/mp4");
    expect(resolveAudioMime("application/octet-stream", "x.wav")).toBe("audio/wav");
    expect(resolveAudioMime("audio/webm;codecs=opus", "r.webm")).toBe("audio/webm");
    expect(() => resolveAudioMime("", "notes.txt")).toThrow();
  });

  it("requires the rights confirmation and a speaker name", async () => {
    if (!(await hasFfmpeg())) return;
    await expect(save(tone("wav"), "audio/wav", "a", { consent: false })).rejects.toThrow("إذن");
    await expect(save(tone("wav"), "audio/wav", "a", { speaker: " " })).rejects.toThrow("صاحب الصوت");
  });

  it("saves MP3, WAV, M4A as they are and converts a browser WebM recording to M4A, with durations", async () => {
    if (!(await hasFfmpeg())) return;
    const mp3 = await save(tone("mp3", 1.5), "audio/mpeg", "a.mp3");
    const wav = await save(tone("wav", 1), "audio/wav", "b.wav");
    const m4a = await save(tone("m4a", 2, 500), "audio/x-m4a", "c.m4a");
    const rec = await save(tone("webm", 3, 600), "audio/webm;codecs=opus", "تسجيل", { origin: "recording" });
    expect([mp3.mime_type, wav.mime_type, m4a.mime_type, rec.mime_type]).toEqual(["audio/mpeg", "audio/wav", "audio/mp4", "audio/mp4"]);
    expect(Number(rec.duration_sec)).toBeCloseTo(3, 0);
    expect(Number(mp3.duration_sec)).toBeGreaterThan(1.4);
    expect(rec.rights).toMatchObject({ origin: "recording", speaker: "منجية", consent: true });
    await expect(save(new TextEncoder().encode("not audio at all"), "audio/mpeg", "x.mp3")).rejects.toThrow("تعذّرت قراءة");
    // Uploading the same file again reuses it (no duplicate).
    const again = await save(tone("wav", 1), "audio/wav", "نسخة");
    expect(again.id).toBe(wav.id);
    expect(again.name).toBe("نسخة");
    expect((await listAudio(db, ws)).length).toBe(4);
  });

  it("links to a scene and a character, places and trims, exports at that place, then deletes everywhere", async () => {
    if (!(await hasFfmpeg())) return;
    const p = await createProject(db, { workspaceId: ws, startType: "text", platformPreset: "youtube-video",
      inputText: "ذهبت سالمة إلى المخبز. اشترت الخبز الطازج. عادت إلى البيت سعيدة." });
    await generateScript(db, p.id);
    const scenes = await listScenes(db, p.id);
    await updateScene(db, scenes[0].id, { duration_sec: 4 });
    const a = await save(tone("wav", 3, 800), "audio/wav", "سطر سالمة", { projectId: p.id });
    await setSceneMedia(db, scenes[0].id, "audio_asset_id", a.id);
    const ch = await createCharacter(db, ws, { name: "سالمة" });
    await setCharacterVoiceSample(db, ch.id, a.id);
    const lib = await listAudio(db, ws, p.id);
    expect(lib[0].scenes.map((s) => s.position)).toEqual([1]);
    expect(lib[0].characters.map((c) => c.name)).toEqual(["سالمة"]);

    await expect(setSceneAudioEdit(db, scenes[0].id, { offset: 5, trimStart: 0, trimEnd: null })).rejects.toThrow();
    await expect(setSceneAudioEdit(db, scenes[0].id, { offset: 0, trimStart: 2, trimEnd: 1 })).rejects.toThrow();
    await setSceneAudioEdit(db, scenes[0].id, { offset: 1, trimStart: 0.5, trimEnd: 1.5 });

    const out = await exportDraftVideo(db, p.id, { captions: false, toPos: 1, motion: false });
    const file = `${dir}/${(await getAsset(db, String(out.job.output!.assetId)))!.storage_key}`;
    const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-ac", "1", "-ar", "8000", "-f", "s16le", "-"], { maxBuffer: 1 << 26 });
    const loud: number[] = [];
    for (let w = 0; w + 80 <= pcm.length / 2; w += 80) { // 10 ms windows
      let peak = 0; for (let i = w; i < w + 80; i++) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i * 2)));
      if (peak > 800) loud.push(w / 8000);
    }
    expect(loud[0]).toBeGreaterThan(0.9); expect(loud[0]).toBeLessThan(1.15);
    expect(loud.at(-1)! - loud[0]).toBeGreaterThan(0.85); expect(loud.at(-1)! - loud[0]).toBeLessThan(1.1);

    // Changing the scene's audio resets placement; deleting removes the file and every link.
    const b = await save(tone("wav", 1, 300), "audio/wav", "آخر");
    await setSceneMedia(db, scenes[0].id, "audio_asset_id", b.id);
    expect(Number((await listScenes(db, p.id))[0].audio_offset_sec)).toBe(0);
    await setSceneMedia(db, scenes[0].id, "audio_asset_id", a.id);
    await deleteAudio(db, ws, a.id);
    expect(fs.existsSync(`${dir}/${a.storage_key}`)).toBe(false);
    expect((await listScenes(db, p.id))[0].audio_asset_id).toBeNull();
    const [c] = await db.query<{ voice_sample_asset_id: string | null }>(`select voice_sample_asset_id from characters where id=$1`, [ch.id]);
    expect(c.voice_sample_asset_id).toBeNull();
  }, 120000);

  it("talking photo uses the recorded voice as-is, with no voice synthesis", async () => {
    if (!(await hasFfmpeg())) return;
    const img = await saveAsset(db, { workspaceId: ws, source: "upload", name: "f.svg", mimeType: "image/svg+xml", bytes: new TextEncoder().encode(placeholderSvg({ seed: "x", width: 256, height: 256, label: "x", prompt: "x" })) });
    const rec = await save(tone("webm", 2), "audio/webm", "تسجيلي", { origin: "recording" });
    const r = await talkingPhoto(db, { workspaceId: ws, imageAssetId: img.id, audioAssetId: rec.id });
    expect(r.audioAssetId).toBe(rec.id);
    const voiceJobs = await db.query(`select 1 from generation_jobs where type='voice.synthesize'`);
    expect(voiceJobs.length).toBe(0);
    const [job] = await db.query<{ input: { audioAssetId: string } }>(`select input from generation_jobs where type='avatar.talk'`);
    expect(job.input.audioAssetId).toBe(rec.id); // the same recording is what a lip-sync provider receives
  }, 60000);
});
