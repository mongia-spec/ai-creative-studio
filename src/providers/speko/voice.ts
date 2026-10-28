import type { VoiceProvider } from "../types";

/**
 * Real Arabic voice through Speko (POST https://api.speko.dev/v1/synthesize, Bearer SPEKO_API_KEY),
 * pinned to ElevenLabs eleven_v3 so a character's Voice ID always sounds the same.
 * Active only with PROVIDERS_MODE=live and SPEKO_API_KEY set. The response body is the audio itself.
 * Child voices: the saved `pitch` (semitones) is applied later by FFmpeg in the audio pipeline.
 */
export function spekoConfigured() {
  return process.env.PROVIDERS_MODE === "live" && !!process.env.SPEKO_API_KEY;
}

export function spekoVoiceProvider(fetchImpl: typeof fetch = fetch): VoiceProvider {
  const price = Number(process.env.SPEKO_PRICE_PER_1K_CHARS_USD ?? 0.3) / 1000;
  return {
    info: {
      id: "speko-elevenlabs", name: "Speko · ElevenLabs v3 (صوت عربي حقيقي)", capability: "voice", isMock: false,
      languages: ["ar", "en"], dialects: [], tiers: ["draft", "standard", "pro", "cinematic"],
      pricing: { unitType: "characters", unitPriceUsd: price },
      commercial: "حسب شروط Speko وElevenLabs؛ الأصوات الجاهزة ليست حصرية",
      support: { voiceConsistency: { level: "full", note: "نفس Voice ID ونفس النموذج في كل مرة" } },
    },
    async synthesize(req) {
      const base = process.env.SPEKO_BASE_URL || "https://api.speko.dev";
      const model = process.env.SPEKO_TTS_MODEL || "eleven_v3";
      const r = await fetchImpl(`${base}/v1/synthesize`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.SPEKO_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: req.text, intent: { language: req.language || "ar" }, model,
          ...(req.voiceId ? { voice: req.voiceId } : {}),
          ...(req.speed && req.speed !== 1 ? { speed: req.speed } : {}),
          constraints: { allowedProviders: { tts: ["elevenlabs"] } },
        }),
      });
      if (!r.ok) throw new Error(`Speko رفض الطلب (${r.status}): ${(await r.text()).slice(0, 300)}`);
      const mimeType = (r.headers.get("content-type") ?? "audio/mpeg").split(";")[0];
      const bytes = new Uint8Array(await r.arrayBuffer());
      return { result: { bytes, mimeType }, usage: { units: req.text.length, unitType: "characters", unitPriceUsd: price, model } };
    },
  };
}
