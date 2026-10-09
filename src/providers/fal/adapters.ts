import type { ImageProvider, VideoProvider } from "../types";
import { dataUri, falDownload, falRun } from "./client";

/**
 * fal.ai adapters. Model ids and prices are configuration (env), not code, so another model or
 * vendor can replace them without touching the app. Defaults checked on 2026-10-09:
 *  - images: ByteDance Seedream 4 (text-to-image / edit with up to 10 references), $0.03 per image
 *  - video:  Wan 2.2 A14B image-to-video, $0.04/s at 480p, $0.08/s at 720p (billed at 16 fps)
 * Both pages carry fal's «Commercial use» badge.
 */
const env = (k: string, d: string) => process.env[k] || d;
const num = (k: string, d: number) => Number(process.env[k] ?? d);

export function falImageProvider(fetchImpl?: typeof fetch): ImageProvider {
  const price = num("FAL_IMAGE_PRICE_USD", 0.03);
  return {
    info: {
      id: "fal-image", name: "fal.ai · Seedream 4", capability: "image", isMock: false, languages: ["ar", "en"], dialects: [],
      tiers: ["draft", "standard", "pro"], pricing: { unitType: "images", unitPriceUsd: price }, commercial: "مسموح (شارة Commercial use على fal.ai)",
      support: {
        identityConsistency: { level: "partial", note: "يحافظ على الملامح من الصور المرجعية بدرجة جيدة دون ضمان تطابق تام" },
        referenceImages: { level: "full", note: "حتى 10 صور مرجعية" },
      },
    },
    async generateImage(req) {
      const refs = req.references ?? [];
      const model = refs.length ? env("FAL_IMAGE_EDIT_MODEL", "fal-ai/bytedance/seedream/v4/edit") : env("FAL_IMAGE_MODEL", "fal-ai/bytedance/seedream/v4/text-to-image");
      const { data, requestId } = await falRun<{ images: { url: string; width?: number; height?: number }[] }>(model, {
        prompt: [req.prompt, req.style ? `Visual style: ${req.style}` : ""].filter(Boolean).join("\n"),
        image_size: { width: req.width, height: req.height }, num_images: 1, enable_safety_checker: true,
        ...(refs.length ? { image_urls: refs.slice(-10).map(dataUri) } : {}),
      }, { fetch: fetchImpl });
      const img = data.images?.[0];
      if (!img?.url) throw new Error("fal.ai لم يُرجع صورة");
      const file = await falDownload(img.url, fetchImpl);
      return {
        result: { bytes: file.bytes, mimeType: file.mimeType || "image/png", width: img.width ?? req.width, height: img.height ?? req.height },
        usage: { units: 1, unitType: "images", unitPriceUsd: price, model, externalRef: requestId },
      };
    },
  };
}

export function falVideoProvider(fetchImpl?: typeof fetch): VideoProvider {
  const byResolution = { "480p": num("FAL_VIDEO_PRICE_480P_USD", 0.04), "720p": num("FAL_VIDEO_PRICE_720P_USD", 0.08) };
  const FPS = 16;
  return {
    info: {
      id: "fal-video", name: "fal.ai · Wan 2.2 (صورة إلى فيديو)", capability: "video", isMock: false, languages: ["en"], dialects: [],
      tiers: ["draft", "standard", "pro"], pricing: { unitType: "seconds", unitPriceUsd: byResolution["480p"], byResolution },
      commercial: "مسموح (شارة Commercial use على fal.ai؛ أوزان Wan بترخيص Apache-2.0)",
      limits: { maxSecondsPerClip: 10 },
      support: {
        characterMotion: { level: "partial", note: "حركات جسم بسيطة مقنعة غالبًا؛ حركات اليد الدقيقة قد تحتاج إعادة" },
        identityConsistency: { level: "partial", note: "يبدأ من الإطار الأول فتبقى الملامح قريبة داخل المقطع، دون ضمان" },
      },
    },
    async generateVideo(req) {
      if (!req.image) throw new Error("توليد الفيديو يحتاج إطارًا أول");
      const model = env("FAL_VIDEO_MODEL", "fal-ai/wan/v2.2-a14b/image-to-video");
      const resolution = req.resolution in byResolution ? req.resolution : "480p";
      const numFrames = Math.min(161, Math.max(17, Math.round(req.durationSec * FPS) + 1));
      const aspect = req.width > req.height * 1.2 ? "16:9" : req.height > req.width * 1.2 ? "9:16" : "1:1";
      const { data, requestId } = await falRun<{ video: { url: string } }>(model, {
        image_url: dataUri(req.image), prompt: req.prompt, negative_prompt: req.negativePrompt ?? "",
        num_frames: numFrames, frames_per_second: FPS, resolution, aspect_ratio: aspect, enable_safety_checker: true,
      }, { fetch: fetchImpl });
      if (!data.video?.url) throw new Error("fal.ai لم يُرجع فيديو");
      const file = await falDownload(data.video.url, fetchImpl);
      const seconds = (numFrames - 1) / FPS;
      return {
        result: { bytes: file.bytes, mimeType: "video/mp4", durationSec: seconds },
        usage: { units: seconds, unitType: "seconds", unitPriceUsd: byResolution[resolution as keyof typeof byResolution], model, externalRef: requestId },
      };
    },
  };
}
