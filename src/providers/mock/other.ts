import type { MusicProvider, ProviderInfo, SpeechToTextProvider, VideoProvider, Capability } from "../types";

/**
 * Mocks for capabilities scheduled for later phases. They satisfy the interfaces so the
 * pipeline is wired end to end, return tiny empty placeholders, and cost nothing.
 * The UI marks these features "Coming soon" / "Provider required"; nothing presents them as real.
 */
function info(capability: Capability, unitType: string): ProviderInfo {
  return {
    id: `mock-${capability}`, name: `Mock ${capability}`, capability, isMock: true,
    languages: ["ar", "en"], dialects: [], tiers: ["draft"], pricing: { unitType, unitPriceUsd: 0 },
  };
}
const empty = (mimeType: string, durationSec = 0) => ({ bytes: new Uint8Array(), mimeType, durationSec });

/** Free stand-in: a slow camera push on the first frame (FFmpeg). Not AI motion: characters do not move. */
export const mockVideoProvider: VideoProvider = {
  info: {
    ...info("video", "seconds"), pricing: { unitType: "seconds", unitPriceUsd: 0, byResolution: { "480p": 0, "720p": 0 } },
    support: { characterMotion: { level: "simulated", note: "تجريبي: حركة كاميرا على الصورة فقط، الشخصيات لا تتحرك" } },
  },
  async generateVideo(req) {
    const { hasFfmpeg, runFfmpeg, withTempDir, EXT_BY_MIME } = await import("@/lib/ffmpeg");
    if (!req.image || !(await hasFfmpeg())) return { result: empty("video/mp4", req.durationSec), usage: { units: req.durationSec, unitType: "seconds" } };
    const img = req.image;
    const w = req.width - (req.width % 2), h = req.height - (req.height % 2), frames = Math.max(1, Math.round(req.durationSec * 25));
    const bytes = await withTempDir(async (dir) => {
      const fs = await import("node:fs/promises");
      const src = `${dir}/f.${EXT_BY_MIME[img.mimeType] ?? "png"}`;
      await fs.writeFile(src, img.bytes);
      await runFfmpeg(["-i", src, "-vf", `scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,crop=${w * 2}:${h * 2},zoompan=z='min(zoom+0.0015,1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=25,format=yuv420p`,
        "-frames:v", String(frames), "-c:v", "libx264", "-preset", "veryfast", "-movflags", "+faststart", `${dir}/o.mp4`], 300000);
      return new Uint8Array(await fs.readFile(`${dir}/o.mp4`));
    });
    return { result: { bytes, mimeType: "video/mp4", durationSec: req.durationSec }, usage: { units: req.durationSec, unitType: "seconds", unitPriceUsd: 0 } };
  },
};
export const mockSttProvider: SpeechToTextProvider = {
  info: info("stt", "seconds"),
  async transcribe() { return { result: { text: "", segments: [] }, usage: { units: 0, unitType: "seconds" } }; },
};
export const mockMusicProvider: MusicProvider = {
  info: info("music", "seconds"),
  async compose(req) { return { result: empty("audio/mpeg", req.durationSec), usage: { units: req.durationSec, unitType: "seconds" } }; },
};
