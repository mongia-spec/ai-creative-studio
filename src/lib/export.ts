import fs from "node:fs/promises";
import path from "node:path";
import type { Db } from "@/db/client";
import { getPreset, type PlatformPreset } from "@/config/platform-presets";
import { getAsset, readAssetBytes, saveAsset } from "./assets";
import { EXT_BY_MIME, hasFfmpeg, runFfmpeg, withTempDir } from "./ffmpeg";
import type { Scene } from "./scenes";

/**
 * Draft video export, made locally and for free with FFmpeg: every scene's preview for its
 * duration, at the platform's aspect ratio, with Arabic captions burned in (libass shapes and
 * orders Arabic correctly) inside the platform's safe area, plus a silent audio track.
 */
export const DRAFT_MAX_SIDE = 1280;

export function draftSize(p: PlatformPreset) {
  const k = DRAFT_MAX_SIDE / Math.max(p.width, p.height);
  const even = (n: number) => Math.round((n * k) / 2) * 2;
  return { width: even(p.width), height: even(p.height) };
}

const ts = (sec: number) => {
  const cs = Math.round(sec * 100);
  const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), s = Math.floor((cs % 6000) / 100), c = cs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
};

export function sceneCaption(s: Pick<Scene, "dialogue" | "narration">) {
  return (s.dialogue || s.narration || "").trim();
}

/** ASS subtitles: one cue per scene, RTL-marked, wrapped by libass, kept inside the safe area. */
export function buildAss(scenes: { caption: string; start: number; end: number }[], preset: PlatformPreset, size: { width: number; height: number }) {
  const fontSize = Math.round(size.height * (size.height > size.width ? 0.034 : 0.05));
  const marginV = Math.round((size.height * (preset.captions.position === "center" ? 35 : preset.safeArea.bottom + 2)) / 100);
  const marginL = Math.round((size.width * (preset.safeArea.left + 4)) / 100);
  const marginR = Math.round((size.width * (preset.safeArea.right + 4)) / 100);
  const clean = (t: string) => "\u200F" + t.replace(/[{}]/g, "").replace(/\\/g, "＼").replace(/\r?\n/g, "\\N\u200F");
  return [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${size.width}`, `PlayResY: ${size.height}`, "WrapStyle: 0", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,DejaVu Sans,${fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H99000000,1,0,0,0,100,100,0,0,3,${Math.max(2, Math.round(fontSize / 6))},0,2,${marginL},${marginR},${marginV},178`,
    "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...scenes.filter((s) => s.caption).map((s) => `Dialogue: 0,${ts(s.start)},${ts(s.end)},Default,,0,0,0,,${clean(s.caption)}`),
    "",
  ].join("\n");
}

export async function renderDraftVideo(db: Db, projectId: string, opts: { captions: boolean }) {
  if (!(await hasFfmpeg())) throw new Error("FFmpeg غير مثبت على هذا الجهاز، وهو مطلوب للتصدير المحلي");
  const [project] = await db.query<{ workspace_id: string; title: string; platform_preset: string }>(
    `select workspace_id, title, platform_preset from projects where id=$1`, [projectId]);
  if (!project) throw new Error("المشروع غير موجود");
  const scenes = await db.query<Scene>(`select * from scenes where project_id=$1 order by position`, [projectId]);
  if (!scenes.length) throw new Error("لا مشاهد للتصدير");
  const missing = scenes.filter((s) => !s.preview_asset_id).map((s) => s.position);
  if (missing.length) throw new Error(`المشاهد ${missing.join("، ")} بلا معاينة. ولّدي معايناتها أولًا`);
  const preset = getPreset(project.platform_preset);
  const size = draftSize(preset);

  return withTempDir(async (dir) => {
    const args: string[] = [];
    const cues: { caption: string; start: number; end: number }[] = [];
    let t = 0;
    for (const [i, s] of scenes.entries()) {
      const a = await getAsset(db, s.preview_asset_id!);
      if (!a) throw new Error(`معاينة المشهد ${s.position} غير موجودة`);
      const file = path.join(dir, `s${i}.${EXT_BY_MIME[a.mime_type] ?? "png"}`);
      await fs.writeFile(file, await readAssetBytes(a));
      const d = Math.max(1, Number(s.duration_sec));
      args.push("-loop", "1", "-t", String(d), "-i", file);
      cues.push({ caption: sceneCaption(s), start: t, end: t + d });
      t += d;
    }
    const n = scenes.length;
    const chains = scenes.map((_, i) =>
      `[${i}:v]scale=${size.width}:${size.height}:force_original_aspect_ratio=decrease,pad=${size.width}:${size.height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${preset.fps},format=yuv420p[v${i}]`);
    let filter = `${chains.join(";")};${scenes.map((_, i) => `[v${i}]`).join("")}concat=n=${n}:v=1:a=0[cat]`;
    if (opts.captions && cues.some((c) => c.caption)) {
      await fs.writeFile(path.join(dir, "subs.ass"), buildAss(cues, preset, size));
      filter += `;[cat]ass=subs.ass[out]`;
    } else filter += `;[cat]null[out]`;
    const out = path.join(dir, "draft.mp4");
    await runFfmpeg([
      ...args, "-f", "lavfi", "-t", String(t), "-i", "anullsrc=r=44100:cl=stereo",
      "-filter_complex", filter, "-map", "[out]", "-map", `${n}:a`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-c:a", "aac", "-b:a", "64k",
      "-shortest", "-movflags", "+faststart", out,
    ], 600000, dir);
    const bytes = new Uint8Array(await fs.readFile(out));
    return saveAsset(db, {
      workspaceId: project.workspace_id, projectId, source: "export", name: `${project.title} - ${preset.label}.mp4`,
      mimeType: "video/mp4", bytes, width: size.width, height: size.height, durationSec: t,
    });
  });
}
