import fs from "node:fs/promises";
import path from "node:path";
import type { LipSyncProvider } from "../types";
import { EXT_BY_MIME, hasFfmpeg, runFfmpeg, withTempDir } from "@/lib/ffmpeg";

/**
 * Mock talking avatar, built locally with FFmpeg: the ORIGINAL image, untouched, played with
 * the audio as an MP4. The face is never redrawn. There is no lip movement: real lip sync,
 * blinking and head motion need a talking-avatar provider.
 */
export const mockLipSyncProvider: LipSyncProvider = {
  info: {
    id: "mock-lipsync", name: "Mock Talking Avatar (FFmpeg محلي)", capability: "lipsync", isMock: true,
    languages: ["ar", "en"], dialects: [], tiers: ["draft", "standard", "pro", "cinematic"],
    pricing: { unitType: "seconds", unitPriceUsd: 0 },
    support: {
      identityConsistency: { level: "full", note: "يستخدم الصورة الأصلية كما هي دون أي تعديل للوجه." },
      talkingAvatar: { level: "simulated", note: "فيديو من الصورة الثابتة مع الصوت، دون حركة." },
      lipSync: { level: "none", note: "لا يحرّك الشفاه ولا العينين ولا الرأس." },
    },
  },
  async lipSync(req) {
    if (!(await hasFfmpeg())) throw new Error("FFmpeg غير مثبت على هذا الجهاز، وهو مطلوب لإنشاء الفيديو محليًا");
    return withTempDir(async (dir) => {
      const img = path.join(dir, `face.${EXT_BY_MIME[req.image.mimeType] ?? "png"}`);
      const aud = path.join(dir, `voice.${EXT_BY_MIME[req.audio.mimeType] ?? "wav"}`);
      const out = path.join(dir, "out.mp4");
      await fs.writeFile(img, req.image.bytes);
      await fs.writeFile(aud, req.audio.bytes);
      await runFfmpeg([
        "-loop", "1", "-i", img, "-i", aud,
        // Fit inside 720px, keep aspect, even dimensions; image content is not altered.
        "-vf", "scale='min(720,iw)':-2:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2,format=yuv420p",
        "-c:v", "libx264", "-tune", "stillimage", "-preset", "veryfast", "-r", "25",
        "-c:a", "aac", "-b:a", "96k", "-shortest", "-movflags", "+faststart", out,
      ]);
      const bytes = new Uint8Array(await fs.readFile(out));
      return { result: { bytes, mimeType: "video/mp4", durationSec: req.audio.durationSec }, usage: { units: req.audio.durationSec ?? 0, unitType: "seconds", model: "ffmpeg-still" } };
    });
  },
};
