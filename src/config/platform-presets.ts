/**
 * Platform presets are pure configuration: add a platform by adding an entry here.
 * Safe areas are percentages of the frame kept clear of platform UI (captions stay inside).
 */
export interface PlatformPreset {
  id: string;
  label: string; // Arabic UI label
  platform: string;
  aspectRatio: "9:16" | "16:9" | "1:1" | "4:5" | "3:4" | "4:3";
  width: number;
  height: number;
  fps: number;
  defaultDurationSec: number;
  maxDurationSec: number;
  safeArea: { top: number; bottom: number; left: number; right: number };
  captions: { enabledByDefault: boolean; position: "bottom" | "center" };
}

export const PLATFORM_PRESETS: PlatformPreset[] = [
  {
    id: "instagram-reel", label: "ريلز إنستغرام", platform: "instagram",
    aspectRatio: "9:16", width: 1080, height: 1920, fps: 30,
    defaultDurationSec: 30, maxDurationSec: 90,
    safeArea: { top: 14, bottom: 20, left: 6, right: 12 },
    captions: { enabledByDefault: true, position: "center" },
  },
  {
    id: "youtube-short", label: "يوتيوب شورتس", platform: "youtube",
    aspectRatio: "9:16", width: 1080, height: 1920, fps: 30,
    defaultDurationSec: 45, maxDurationSec: 60,
    safeArea: { top: 12, bottom: 18, left: 6, right: 12 },
    captions: { enabledByDefault: true, position: "center" },
  },
  {
    id: "tiktok", label: "تيك توك", platform: "tiktok",
    aspectRatio: "9:16", width: 1080, height: 1920, fps: 30,
    defaultDurationSec: 30, maxDurationSec: 180,
    safeArea: { top: 12, bottom: 22, left: 6, right: 14 },
    captions: { enabledByDefault: true, position: "center" },
  },
  {
    id: "youtube-video", label: "فيديو يوتيوب", platform: "youtube",
    aspectRatio: "16:9", width: 1920, height: 1080, fps: 30,
    defaultDurationSec: 120, maxDurationSec: 1800,
    safeArea: { top: 5, bottom: 10, left: 5, right: 5 },
    captions: { enabledByDefault: false, position: "bottom" },
  },
  {
    id: "instagram-post", label: "منشور إنستغرام", platform: "instagram",
    aspectRatio: "4:5", width: 1080, height: 1350, fps: 30,
    defaultDurationSec: 30, maxDurationSec: 60,
    safeArea: { top: 5, bottom: 8, left: 5, right: 5 },
    captions: { enabledByDefault: true, position: "bottom" },
  },
  {
    id: "square", label: "مربّع 1:1", platform: "generic",
    aspectRatio: "1:1", width: 1080, height: 1080, fps: 30,
    defaultDurationSec: 30, maxDurationSec: 600,
    safeArea: { top: 5, bottom: 8, left: 5, right: 5 },
    captions: { enabledByDefault: true, position: "bottom" },
  },
];

export function getPreset(id: string): PlatformPreset {
  const p = PLATFORM_PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown platform preset: ${id}`);
  return p;
}

export const STYLES = [
  { id: "cinematic", label: "سينمائي" },
  { id: "cartoon", label: "كرتوني" },
  { id: "realistic", label: "واقعي" },
  { id: "watercolor", label: "ألوان مائية" },
  { id: "documentary", label: "وثائقي" },
] as const;
