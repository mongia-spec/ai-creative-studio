/**
 * Provider abstraction. The app only talks to these interfaces; each real AI vendor
 * becomes one adapter later. Every adapter declares what it really supports and its price.
 */
export type Capability = "text" | "image" | "video" | "voice" | "stt" | "lipsync" | "music";
export type QualityTier = "draft" | "standard" | "pro" | "cinematic";

export interface ProviderInfo {
  id: string;
  name: string;
  capability: Capability;
  isMock: boolean;
  languages: string[];
  /** Only dialects the provider actually supports — never assumed. */
  dialects: string[];
  tiers: QualityTier[];
  pricing: { unitType: string; unitPriceUsd: number };
  limits?: Record<string, number>;
}

export interface Usage {
  units: number;
  unitType: string;
  model?: string;
  externalRef?: string;
}

// ---------- Text (LLM) ----------
export interface ScriptRequest {
  startType: "idea" | "text";
  input: string;
  language: string;
  style: string;
  targetDurationSec: number;
  aspectRatio: string;
}
export interface DraftScene {
  title: string;
  description: string;
  location: string;
  characters: string;
  narration: string;
  dialogue: string;
  camera: string;
  lighting: string;
  mood: string;
  durationSec: number;
  visualPrompt: string;
  audioNotes: string;
  shots: { description: string; camera: string; durationSec: number }[];
}
export interface ScriptDraft {
  title: string;
  logline: string;
  body: string;
  scenes: DraftScene[];
}
export interface TextProvider {
  info: ProviderInfo;
  generateScript(req: ScriptRequest): Promise<{ result: ScriptDraft; usage: Usage }>;
}

// ---------- Image ----------
export interface ImageRequest {
  prompt: string;
  width: number;
  height: number;
  style: string;
  label?: string;
  seed?: string;
  referenceAssetIds?: string[];
}
export interface ImageResult {
  bytes: Uint8Array;
  mimeType: string;
  width: number;
  height: number;
}
export interface ImageProvider {
  info: ProviderInfo;
  generateImage(req: ImageRequest): Promise<{ result: ImageResult; usage: Usage }>;
}

// ---------- Later capabilities (interfaces fixed now, real adapters later) ----------
export interface MediaResult {
  bytes: Uint8Array;
  mimeType: string;
  durationSec?: number;
}
export interface VideoProvider {
  info: ProviderInfo;
  generateVideo(req: { prompt: string; imageAssetId?: string; durationSec: number; width: number; height: number }): Promise<{ result: MediaResult; usage: Usage }>;
}
export interface VoiceProvider {
  info: ProviderInfo;
  synthesize(req: { text: string; voiceId: string; language: string; dialect?: string; emotion?: string }): Promise<{ result: MediaResult; usage: Usage }>;
}
export interface SpeechToTextProvider {
  info: ProviderInfo;
  transcribe(req: { audioAssetId: string; language?: string }): Promise<{ result: { text: string; segments: { start: number; end: number; text: string }[] }; usage: Usage }>;
}
export interface LipSyncProvider {
  info: ProviderInfo;
  lipSync(req: { faceAssetId: string; audioAssetId: string }): Promise<{ result: MediaResult; usage: Usage }>;
}
export interface MusicProvider {
  info: ProviderInfo;
  compose(req: { prompt: string; durationSec: number; mood?: string }): Promise<{ result: MediaResult; usage: Usage }>;
}

export interface ProviderMap {
  text: TextProvider;
  image: ImageProvider;
  video: VideoProvider;
  voice: VoiceProvider;
  stt: SpeechToTextProvider;
  lipsync: LipSyncProvider;
  music: MusicProvider;
}
