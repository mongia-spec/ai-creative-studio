import { beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import type { Db } from "@/db/client";
import { freshEnv } from "./helpers";
import { createProject } from "@/lib/projects";
import { exportDraftVideo, generateScript, listExports } from "@/lib/studio";
import { listScenes, updateScene } from "@/lib/scenes";
import { buildAss, draftSize } from "@/lib/export";
import { getPreset } from "@/config/platform-presets";
import { getAsset } from "@/lib/assets";
import { hasFfmpeg } from "@/lib/ffmpeg";
import { getStorage } from "@/lib/storage";

let db: Db;
let ws: string;
let dir: string;
beforeEach(async () => {
  ({ db, workspaceId: ws, storageDir: dir } = await freshEnv());
});

describe("draft export", () => {
  it("draft size keeps the aspect ratio with even sides", () => {
    expect(draftSize(getPreset("instagram-reel"))).toEqual({ width: 720, height: 1280 });
    expect(draftSize(getPreset("youtube-video"))).toEqual({ width: 1280, height: 720 });
  });

  it("ASS captions are RTL-marked, escaped and inside the safe area", () => {
    const p = getPreset("instagram-reel");
    const ass = buildAss([{ caption: "مرحبا {يا} أصدقاء\nسطر ثانٍ", start: 0, end: 4.5 }, { caption: "", start: 4.5, end: 6 }], p, draftSize(p));
    expect(ass).toContain("Dialogue: 0,0:00:00.00,0:00:04.50,Default,,0,0,0,,‏مرحبا يا أصدقاء\\N‏سطر ثانٍ");
    expect(ass.match(/^Dialogue/gm)).toHaveLength(1);
  });

  it("renders an MP4 with the project's duration and reuses it until something changes", async () => {
    if (!(await hasFfmpeg())) return;
    const p = await createProject(db, { workspaceId: ws, startType: "text", platformPreset: "youtube-video",
      inputText: "ذهبت سالمة إلى المخبز. اشترت الخبز الطازج. عادت إلى البيت سعيدة." });
    await generateScript(db, p.id);
    const r1 = await exportDraftVideo(db, p.id);
    const asset = (await getAsset(db, String(r1.job.output!.assetId)))!;
    expect(asset.mime_type).toBe("video/mp4");
    const scenes = await listScenes(db, p.id);
    const total = scenes.reduce((a, s) => a + Number(s.duration_sec), 0);
    const file = `${dir}/${asset.storage_key}`;
    const probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=width,height,codec_type", "-of", "json", file]).toString();
    const info = JSON.parse(probe);
    expect(Math.abs(Number(info.format.duration) - total)).toBeLessThan(0.5);
    expect(info.streams.find((s: { codec_type: string }) => s.codec_type === "video").width).toBe(1280);
    expect(info.streams.some((s: { codec_type: string }) => s.codec_type === "audio")).toBe(true);

    const r2 = await exportDraftVideo(db, p.id);
    expect(r2.reused).toBe(true);
    await updateScene(db, scenes[0].id, { narration: "تعليق جديد" });
    const r3 = await exportDraftVideo(db, p.id);
    expect(r3.reused).toBe(false);
    expect(await listExports(db, p.id)).toHaveLength(2);
    void getStorage;
  }, 120000);

  it("burns captions: frames differ with and without them", async () => {
    if (!(await hasFfmpeg())) return;
    const p = await createProject(db, { workspaceId: ws, startType: "text", platformPreset: "square", inputText: "مشهد واحد بتعليق عربي واضح." });
    await generateScript(db, p.id);
    const withC = (await getAsset(db, String((await exportDraftVideo(db, p.id, true)).job.output!.assetId)))!;
    const noC = (await getAsset(db, String((await exportDraftVideo(db, p.id, false)).job.output!.assetId)))!;
    const frame = (k: string) => execFileSync("ffmpeg", ["-v", "error", "-ss", "1", "-i", `${dir}/${k}`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: 64 * 1024 * 1024 });
    const a = frame(withC.storage_key), b = frame(noC.storage_key);
    let diff = 0;
    for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 40) diff++;
    expect(diff).toBeGreaterThan(500);
  }, 120000);

  it("explains what is missing instead of failing silently", async () => {
    const p = await createProject(db, { workspaceId: ws, startType: "idea", platformPreset: "square", inputText: "فكرة" });
    await expect(exportDraftVideo(db, p.id)).rejects.toThrow(/مشاهد/);
  });
});
