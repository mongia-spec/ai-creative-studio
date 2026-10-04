import type { LipSyncProvider, MusicProvider, ProviderInfo, SpeechToTextProvider, VideoProvider, VoiceProvider, Capability } from "../types";

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

export const mockVideoProvider: VideoProvider = {
  info: info("video", "seconds"),
  async generateVideo(req) { return { result: empty("video/mp4", req.durationSec), usage: { units: req.durationSec, unitType: "seconds" } }; },
};
export const mockVoiceProvider: VoiceProvider = {
  info: info("voice", "characters"),
  async synthesize(req) { return { result: empty("audio/mpeg"), usage: { units: req.text.length, unitType: "characters" } }; },
};
export const mockSttProvider: SpeechToTextProvider = {
  info: info("stt", "seconds"),
  async transcribe() { return { result: { text: "", segments: [] }, usage: { units: 0, unitType: "seconds" } }; },
};
export const mockLipSyncProvider: LipSyncProvider = {
  info: info("lipsync", "seconds"),
  async lipSync() { return { result: empty("video/mp4"), usage: { units: 0, unitType: "seconds" } }; },
};
export const mockMusicProvider: MusicProvider = {
  info: info("music", "seconds"),
  async compose(req) { return { result: empty("audio/mpeg", req.durationSec), usage: { units: req.durationSec, unitType: "seconds" } }; },
};
