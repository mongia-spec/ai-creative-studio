import { beforeEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import type { Db } from "@/db/client";
import { freshEnv } from "./helpers";
import { createProject } from "@/lib/projects";
import { exportDraftVideo, generateScript } from "@/lib/studio";
import { listScenes, updateScene } from "@/lib/scenes";
import { autoDirect, directSuggestion, saveBrandKit, setProjectMusic, setSceneMedia } from "@/lib/production";
import { getAsset, saveAsset } from "@/lib/assets";
import { hasFfmpeg } from "@/lib/ffmpeg";
import { mockSpeechWav } from "@/providers/mock/voice";

let db: Db, ws: string, dir: string;
beforeEach(async () => { ({ db, workspaceId: ws, storageDir: dir } = await freshEnv()); });

const probe = (file: string) => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=width,height,codec_type", "-of", "json", file]).toString());
const wav = async (text: string) => (await saveAsset(db, { workspaceId: ws, source: "upload", name: "a.wav", mimeType: "audio/wav", bytes: mockSpeechWav(text).bytes })).id;

async function project() {
  const p = await createProject(db, { workspaceId: ws, startType: "text", platformPreset: "youtube-video",
    inputText: "ذهبت سالمة إلى المخبز. اشترت الخبز الطازج. عادت إلى البيت سعيدة. شربت اللبن." });
  await generateScript(db, p.id);
  return { p, scenes: await listScenes(db, p.id) };
}

describe("AI director (local rules)", () => {
  it("fills empty camera/motion only and never overwrites the creator", async () => {
    const { p, scenes } = await project();
    await db.query(`update scenes set camera='' where project_id=$1`, [p.id]);
    await updateScene(db, scenes[1].id, { camera: "من فوق", motion: "pan_left" });
    expect(await autoDirect(db, p.id)).toBeGreaterThan(0);
    const after = await listScenes(db, p.id);
    expect(after[0].motion).toBe("zoom_in");
    expect(after[1].camera).toBe("من فوق");
    expect(after.at(-1)!.motion).toBe("zoom_out");
    expect(directSuggestion({ position: 2, mood: "", description: "", dialogue: "مرحبا" }, 4).camera).toContain("قريبة");
    await expect(updateScene(db, scenes[0].id, { motion: "fly" })).rejects.toThrow();
  });
});

describe("export: reframe, shorts, motion, audio, brand", () => {
  it("reframes to 9:16 from the same assets, exports a scene range, adds audio and an end card", async () => {
    if (!(await hasFfmpeg())) return;
    const { p, scenes } = await project();
    await updateScene(db, scenes[0].id, { motion: "zoom_in" });
    await setSceneMedia(db, scenes[0].id, "audio_asset_id", await wav("صوت المشهد الأول"));
    await setProjectMusic(db, p.id, await wav("موسيقى خلفية هادئة جدا"), 0.2);
    await saveBrandKit(db, ws, { name: "استوديو منجية", watermark: "@ostatha.mongia", cta: "تابعونا للمزيد", primary_color: "#0e8a8a" });
    const jobsBefore = await db.query(`select count(*)::int n from generation_jobs where type='scene.preview'`);

    const short = await exportDraftVideo(db, p.id, { captions: true, presetId: "instagram-reel", fromPos: 1, toPos: 2, brand: true, endCard: true });
    const a = (await getAsset(db, String(short.job.output!.assetId)))!;
    const info = probe(`${dir}/${a.storage_key}`);
    const v = info.streams.find((s: { codec_type: string }) => s.codec_type === "video");
    expect([v.width, v.height]).toEqual([720, 1280]);
    const expected = Number(scenes[0].duration_sec) + Number(scenes[1].duration_sec) + 3;
    expect(Math.abs(Number(info.format.duration) - expected)).toBeLessThan(0.3);
    expect(a.name).toContain("(1-2)");
    // No new image generation for the reframe.
    expect(await db.query(`select count(*)::int n from generation_jobs where type='scene.preview'`)).toEqual(jobsBefore);

    // Motion: two frames of the zooming scene differ.
    const frame = (sec: number) => execFileSync("ffmpeg", ["-v", "error", "-ss", String(sec), "-i", `${dir}/${a.storage_key}`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: 1 << 26 });
    const f1 = frame(0.2), f2 = frame(Number(scenes[0].duration_sec) - 0.3);
    let diff = 0; for (let i = 0; i < f1.length; i++) if (Math.abs(f1[i] - f2[i]) > 12) diff++;
    expect(diff).toBeGreaterThan(200);

    // Audio is not silent.
    const vol = spawnSync("ffmpeg", ["-hide_banner", "-i", `${dir}/${a.storage_key}`, "-af", "volumedetect", "-f", "null", "-"]).stderr.toString();
    expect(Number(/max_volume: (-?[\d.]+) dB/.exec(vol)![1])).toBeGreaterThan(-30);
  }, 180000);
});

describe("social copy", () => {
  it("returns hooks and CTAs and logs a free mock call", async () => {
    const { socialCopy } = await import("@/lib/social");
    const { p } = await project();
    const h = await socialCopy(db, p.id, "hook");
    expect(h.lines.length).toBeGreaterThan(2);
    expect(h.mock).toBe(true);
    expect((await socialCopy(db, p.id, "cta")).lines[0]).toBeTruthy();
    const [{ n }] = await db.query<{ n: number }>(`select count(*)::int n from provider_calls where project_id=$1 and capability='text' and cost_usd=0`, [p.id]);
    expect(n).toBeGreaterThanOrEqual(3);
  });
  it("brand kit validates colors", async () => {
    await expect(saveBrandKit(db, ws, { primary_color: "red" })).rejects.toThrow();
    expect((await saveBrandKit(db, ws, { name: " علامتي " })).name).toBe("علامتي");
  });
});
