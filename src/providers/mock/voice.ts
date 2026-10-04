import type { VoiceProvider } from "../types";

/**
 * Mock voice: a real, playable WAV whose length follows the text and the saved speed, with
 * one soft "syllable" beep per word at the saved pitch. It is NOT speech; it lets the whole
 * voice → talking-avatar pipeline (timing, caching, playback) work and be tested for free.
 */
const SAMPLE_RATE = 16000;

export function mockSpeechWav(text: string, speed = 1, pitch = 0): { bytes: Uint8Array; durationSec: number } {
  const words = text.split(/\s+/).filter(Boolean);
  const perWord = 0.38 / speed; // seconds per word (rough Arabic pace)
  const durationSec = Math.max(0.6, Math.round(words.length * perWord * 100) / 100 + 0.3);
  const n = Math.floor(durationSec * SAMPLE_RATE);
  const freq = 220 * Math.pow(2, pitch / 12);
  const pcm = new Int16Array(n);
  const wordSamples = perWord * SAMPLE_RATE;
  for (let i = 0; i < n; i++) {
    const inWord = (i % wordSamples) / wordSamples; // 0..1 within the word slot
    const env = inWord < 0.7 ? Math.sin((Math.PI * inWord) / 0.7) : 0; // gap between words
    pcm[i] = Math.round(env * 0.25 * 32767 * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE));
  }
  const data = new Uint8Array(pcm.buffer);
  const buf = new Uint8Array(44 + data.length);
  const v = new DataView(buf.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, k) => v.setUint8(o + k, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + data.length, true); w(8, "WAVE");
  w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, SAMPLE_RATE, true); v.setUint32(28, SAMPLE_RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, data.length, true);
  buf.set(data, 44);
  return { bytes: buf, durationSec };
}

export const mockVoiceProvider: VoiceProvider = {
  info: {
    id: "mock-voice", name: "Mock Voice (نغمات تجريبية)", capability: "voice", isMock: true,
    languages: ["ar", "en"], dialects: [], tiers: ["draft", "standard", "pro", "cinematic"],
    pricing: { unitType: "characters", unitPriceUsd: 0 },
    support: {
      voiceConsistency: { level: "simulated", note: "يحفظ إعدادات الصوت ويعيدها كما هي، لكنه يُصدر نغمات لا كلامًا." },
    },
  },
  async synthesize(req) {
    const { bytes, durationSec } = mockSpeechWav(req.text, req.speed ?? 1, req.pitch ?? 0);
    return { result: { bytes, mimeType: "audio/wav", durationSec }, usage: { units: req.text.length, unitType: "characters", model: "tone-wav" } };
  },
};
