import type { Capability, ProviderInfo, ProviderMap, QualityTier } from "./types";
import { mockTextProvider } from "./mock/text";
import { mockImageProvider } from "./mock/image";
import { mockMusicProvider, mockSttProvider, mockVideoProvider } from "./mock/other";
import { mockVoiceProvider } from "./mock/voice";
import { mockLipSyncProvider } from "./mock/lipsync";
import { falImageProvider, falVideoProvider } from "./fal/adapters";
import { falConfigured } from "./fal/client";

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

// Real vendors join only when explicitly enabled (PROVIDERS_MODE=live + their key). Swapping vendor =
// another adapter here; the app depends on the interfaces only.
function live(): Partial<Registry> {
  return falConfigured() ? { image: [falImageProvider()], video: [falVideoProvider()] } : {};
}
const overrides: Partial<Registry> = {};
/** Tests only: put a provider (e.g. a priced fake) in front for a capability; null removes it. */
export function setProviderOverride<K extends Capability>(capability: K, provider: ProviderMap[K] | null) {
  if (provider) (overrides as Record<string, unknown[]>)[capability] = [provider];
  else delete overrides[capability];
}

export function getProvider<K extends Capability>(capability: K, tier: QualityTier = "draft"): ProviderMap[K] {
  const mode = process.env.PROVIDERS_MODE ?? "mock";
  const list = [...((overrides[capability] ?? []) as ProviderMap[K][]), ...((live()[capability] ?? []) as ProviderMap[K][]), ...(registry[capability] as ProviderMap[K][])];
  if (overrides[capability]) return list[0];
  const candidates = list.filter((p) => (mode === "mock" ? p.info.isMock : true) && p.info.tiers.includes(tier));
  const chosen = candidates[0] ?? list.find((p) => p.info.isMock);
  if (!chosen) throw new Error(`No provider for ${capability}`);
  return chosen;
}

export function listProviders(): ProviderInfo[] {
  return [...Object.values(live()).flat(), ...Object.values(registry).flat()].map((p) => p.info);
}
