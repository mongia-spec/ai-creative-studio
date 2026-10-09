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

export interface ExportOptions {
  captions: boolean;
  /** Smart reframe: render for another platform from the same assets (no new generation). */
  presetId?: string;
  /** Long video to shorts: only scenes fromPos..toPos. */
  fromPos?: number;
  toPos?: number;
  motion?: boolean;
  audio?: boolean;
  brand?: boolean;
  endCard?: boolean;
}

export interface BrandOverlay { watermark: string; cta: string; primaryColor: string; textColor: string; logo: { bytes: Uint8Array; mimeType: string } | null }

const assColor = (hex: string, alpha = "00") => `&H${alpha}${hex.slice(5, 7)}${hex.slice(3, 5)}${hex.slice(1, 3)}`.toUpperCase();

/** ASS subtitles: one cue per scene, RTL-marked, wrapped by libass, kept inside the safe area. */
export function buildAss(
  scenes: { caption: string; start: number; end: number }[], preset: PlatformPreset, size: { width: number; height: number },
  extra?: { watermark?: string; total?: number; cta?: { text: string; start: number; end: number; color: string } },
) {
  const fontSize = Math.round(size.height * (size.height > size.width ? 0.034 : 0.05));
  const marginV = Math.round((size.height * (preset.captions.position === "center" ? 35 : preset.safeArea.bottom + 2)) / 100);
  const marginL = Math.round((size.width * (preset.safeArea.left + 4)) / 100);
  const marginR = Math.round((size.width * (preset.safeArea.right + 4)) / 100);
  const top = Math.round((size.height * (preset.safeArea.top + 1)) / 100);
  const clean = (t: string) => "\u200F" + t.replace(/[{}]/g, "").replace(/\\/g, "＼").replace(/\r?\n/g, "\\N\u200F");
  const styles = [
    `Style: Default,DejaVu Sans,${fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H99000000,1,0,0,0,100,100,0,0,3,${Math.max(2, Math.round(fontSize / 6))},0,2,${marginL},${marginR},${marginV},178`,
    `Style: Brand,DejaVu Sans,${Math.round(fontSize * 0.6)},&H55FFFFFF,&H00FFFFFF,&H88000000,&H00000000,1,0,0,0,100,100,0,0,1,1,0,9,${marginL},${marginR},${top},178`,
    `Style: CTA,DejaVu Sans,${Math.round(fontSize * 1.4)},${extra?.cta ? assColor(extra.cta.color) : "&H00FFFFFF"},&H00FFFFFF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,5,${marginL},${marginR},0,178`,
  ];
  const events = scenes.filter((x) => x.caption).map((x) => `Dialogue: 0,${ts(x.start)},${ts(x.end)},Default,,0,0,0,,${clean(x.caption)}`);
  if (extra?.watermark && extra.total) events.push(`Dialogue: 1,${ts(0)},${ts(extra.total)},Brand,,0,0,0,,${clean(extra.watermark)}`);
  if (extra?.cta?.text) events.push(`Dialogue: 1,${ts(extra.cta.start)},${ts(extra.cta.end)},CTA,,0,0,0,,${clean(extra.cta.text)}`);
  return [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${size.width}`, `PlayResY: ${size.height}`, "WrapStyle: 0", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    ...styles, "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text", ...events, "",
  ].join("\n");
}

/** Ken Burns style motion on a still (zoompan), computed per output frame. */
export function motionFilter(motion: string, frames: number, size: { width: number; height: number }, fps: number) {
  const N = Math.max(1, frames - 1);
  const center = `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
  const expr: Record<string, string> = {
    zoom_in: `z='1+0.12*on/${N}':${center}`,
    zoom_out: `z='1.12-0.12*on/${N}':${center}`,
    pan_left: `z='1.12':x='(iw-iw/zoom)*on/${N}':y='ih/2-(ih/zoom/2)'`,
    pan_right: `z='1.12':x='(iw-iw/zoom)*(1-on/${N})':y='ih/2-(ih/zoom/2)'`,
  };
  if (!expr[motion]) return "";
  // From one composed frame, zoompan emits all the scene's frames. Upscale first so the zoom
  // stays smooth (no 1px jitter).
  return `,scale=${size.width * 2}:${size.height * 2},zoompan=${expr[motion]}:d=${frames}:s=${size.width}x${size.height}:fps=${fps}`;
}

export async function renderDraftVideo(db: Db, projectId: string, opts: ExportOptions) {
  if (!(await hasFfmpeg())) throw new Error("FFmpeg غير مثبت على هذا الجهاز، وهو مطلوب للتصدير المحلي");
  const [project] = await db.query<{ workspace_id: string; title: string; platform_preset: string; music_asset_id: string | null; music_volume: string }>(
    `select workspace_id, title, platform_preset, music_asset_id, music_volume from projects where id=$1`, [projectId]);
  if (!project) throw new Error("المشروع غير موجود");
  let scenes = await db.query<Scene>(`select * from scenes where project_id=$1 and status<>'rejected' order by position`, [projectId]);
  if (opts.fromPos || opts.toPos) scenes = scenes.filter((x) => x.position >= (opts.fromPos ?? 1) && x.position <= (opts.toPos ?? Infinity));
  if (!scenes.length) throw new Error("لا مشاهد للتصدير");
  const missing = scenes.filter((x) => !x.preview_asset_id).map((x) => x.position);
  if (missing.length) throw new Error(`المشاهد ${missing.join("، ")} بلا معاينة. ولّدي معايناتها أولًا`);
  const preset = getPreset(opts.presetId ?? project.platform_preset);
  const size = draftSize(preset);
  const fps = 25;
  const brand = opts.brand ? await loadBrand(db, project.workspace_id) : null;
  const endCard = !!(opts.endCard && brand?.cta);

  return withTempDir(async (dir) => {
    const inputs: string[] = [];
    const chains: string[] = [];
    const cues: { caption: string; start: number; end: number }[] = [];
    const audioIn: { start: number; asset: string }[] = [];
    let t = 0, idx = 0;
    for (const [i, s] of scenes.entries()) {
      const a = await getAsset(db, s.preview_asset_id!);
      if (!a) throw new Error(`معاينة المشهد ${s.position} غير موجودة`);
      const file = path.join(dir, `s${i}.${EXT_BY_MIME[a.mime_type] ?? "png"}`);
      await fs.writeFile(file, await readAssetBytes(a));
      const d = Math.max(1, Number(s.duration_sec));
      // The still is composed once (one frame), then repeated or moved: much faster than per frame.
      inputs.push("-i", file);
      const frames = Math.round(d * fps);
      const mf = opts.motion === false ? "" : motionFilter(s.motion, frames, size, fps);
      const hold = mf || `,loop=loop=${frames - 1}:size=1:start=0`;
      // Smart reframe: fit the image inside the frame over a blurred fill of itself (no black bars).
      chains.push(
        `[${idx}:v]split[a${i}][b${i}];[a${i}]scale=${size.width}:${size.height}:force_original_aspect_ratio=increase,crop=${size.width}:${size.height},boxblur=20:2[bg${i}];` +
        `[b${i}]scale=${size.width}:${size.height}:force_original_aspect_ratio=decrease[fg${i}];` +
        `[bg${i}][fg${i}]overlay=(W-w)/2:(H-h)/2,setsar=1${hold},setpts=N/${fps}/TB,format=yuv420p[v${i}]`);
      idx++;
      cues.push({ caption: sceneCaption(s), start: t, end: t + d });
      if (opts.audio !== false && s.audio_asset_id) audioIn.push({ start: t, asset: s.audio_asset_id });
      t += d;
    }
    const parts = scenes.map((_, i) => `[v${i}]`);
    const ctaStart = t;
    if (endCard) {
      inputs.push("-f", "lavfi", "-t", "3", "-i", `color=c=0x${brand!.primaryColor.slice(1)}:s=${size.width}x${size.height}:r=${fps}`);
      chains.push(`[${idx}:v]setsar=1,format=yuv420p[vend]`);
      parts.push("[vend]");
      idx++;
      t += 3;
    }
    let filter = `${chains.join(";")};${parts.join("")}concat=n=${parts.length}:v=1:a=0[cat]`;
    let last = "cat";
    if (brand?.logo) {
      const logo = path.join(dir, `logo.${EXT_BY_MIME[brand.logo.mimeType] ?? "png"}`);
      await fs.writeFile(logo, brand.logo.bytes);
      inputs.push("-i", logo);
      const lw = Math.round(size.width * 0.14);
      const m = Math.round((size.width * (preset.safeArea.left + 3)) / 100), top = Math.round((size.height * (preset.safeArea.top + 1)) / 100);
      filter += `;[${idx}:v]scale=${lw}:-1,format=rgba,colorchannelmixer=aa=0.8[logo];[${last}][logo]overlay=${m}:${top}[lg]`;
      last = "lg";
      idx++;
    }
    const wantText = (opts.captions && cues.some((c) => c.caption)) || brand?.watermark || endCard;
    if (wantText) {
      await fs.writeFile(path.join(dir, "subs.ass"), buildAss(opts.captions ? cues : [], preset, size, {
        watermark: brand?.watermark, total: ctaStart,
        cta: endCard ? { text: brand!.cta, start: ctaStart, end: t, color: brand!.textColor } : undefined,
      }));
      filter += `;[${last}]ass=subs.ass[out]`;
    } else filter += `;[${last}]null[out]`;

    // Audio: silent base + per-scene voice-over/SFX at its start + looping music under everything.
    inputs.push("-f", "lavfi", "-t", String(t), "-i", "anullsrc=r=44100:cl=stereo");
    const base = idx++;
    const mixes = [`[${base}:a]`];
    for (const [k, ai] of audioIn.entries()) {
      const a = await getAsset(db, ai.asset);
      if (!a) continue;
      const f = path.join(dir, `a${k}.${EXT_BY_MIME[a.mime_type] ?? "wav"}`);
      await fs.writeFile(f, await readAssetBytes(a));
      inputs.push("-i", f);
      const ms = Math.round(ai.start * 1000);
      filter += `;[${idx}:a]aresample=44100,adelay=${ms}|${ms}[sa${k}]`;
      mixes.push(`[sa${k}]`);
      idx++;
    }
    if (opts.audio !== false && project.music_asset_id) {
      const a = await getAsset(db, project.music_asset_id);
      if (a) {
        const f = path.join(dir, `music.${EXT_BY_MIME[a.mime_type] ?? "mp3"}`);
        await fs.writeFile(f, await readAssetBytes(a));
        inputs.push("-stream_loop", "-1", "-i", f);
        filter += `;[${idx}:a]aresample=44100,volume=${Number(project.music_volume)},afade=t=out:st=${Math.max(0, t - 2)}:d=2[mus]`;
        mixes.push("[mus]");
        idx++;
      }
    }
    filter += `;${mixes.join("")}amix=inputs=${mixes.length}:duration=first:normalize=0[aout]`;

    const out = path.join(dir, "draft.mp4");
    await runFfmpeg([
      ...inputs, "-filter_complex", filter, "-map", "[out]", "-map", "[aout]",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-c:a", "aac", "-b:a", "96k",
      "-t", String(t), "-movflags", "+faststart", out,
    ], 900000, dir);
    const bytes = new Uint8Array(await fs.readFile(out));
    const range = opts.fromPos || opts.toPos ? ` (${scenes[0].position}-${scenes.at(-1)!.position})` : "";
    return saveAsset(db, {
      workspaceId: project.workspace_id, projectId, source: "export", name: `${project.title} - ${preset.label}${range}.mp4`,
      mimeType: "video/mp4", bytes, width: size.width, height: size.height, durationSec: t,
    });
  });
}

async function loadBrand(db: Db, workspaceId: string): Promise<BrandOverlay | null> {
  const [k] = await db.query<{ watermark: string; cta: string; primary_color: string; text_color: string; logo_asset_id: string | null; name: string }>(
    `select * from brand_kits where workspace_id=$1`, [workspaceId]);
  if (!k) return null;
  const logoAsset = k.logo_asset_id ? await getAsset(db, k.logo_asset_id) : null;
  return {
    watermark: k.watermark || (logoAsset ? "" : k.name), cta: k.cta, primaryColor: k.primary_color, textColor: k.text_color,
    logo: logoAsset ? { bytes: await readAssetBytes(logoAsset), mimeType: logoAsset.mime_type } : null,
  };
}
