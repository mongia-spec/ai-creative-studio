import type { Capability, ProviderInfo, ProviderMap, QualityTier } from "./types";
import { mockTextProvider } from "./mock/text";
import { mockImageProvider } from "./mock/image";
import { mockMusicProvider, mockSttProvider, mockVideoProvider } from "./mock/other";
import { mockVoiceProvider } from "./mock/voice";
import { mockLipSyncProvider } from "./mock/lipsync";

/**
 * Provider router. Phase 1 registers mocks only. Adding a real vendor = one adapter file
 * + one entry here, after explicit approval. Selection is by capability and quality tier.
 */
type Registry = { [K in Capability]: ProviderMap[K][] };

const registry: Registry = {
  text: [mockTextProvider],
  image: [mockImageProvider],
  video: [mockVideoProvider],
  voice: [mockVoiceProvider],
  stt: [mockSttProvider],
  lipsync: [mockLipSyncProvider],
  music: [mockMusicProvider],
};

export function getProvider<K extends Capability>(capability: K, tier: QualityTier = "draft"): ProviderMap[K] {
  const mode = process.env.PROVIDERS_MODE ?? "mock";
  const list = registry[capability] as ProviderMap[K][];
  const candidates = list.filter((p) => (mode === "mock" ? p.info.isMock : true) && p.info.tiers.includes(tier));
  const chosen = candidates[0] ?? list.find((p) => p.info.isMock);
  if (!chosen) throw new Error(`No provider for ${capability}`);
  return chosen;
}

export function listProviders(): ProviderInfo[] {
  return Object.values(registry).flat().map((p) => p.info);
}
