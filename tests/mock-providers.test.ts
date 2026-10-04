import { describe, expect, it } from "vitest";
import { mockTextProvider, splitSentences } from "@/providers/mock/text";
import { mockImageProvider } from "@/providers/mock/image";
import { getProvider, listProviders } from "@/providers/registry";

describe("mock text provider", () => {
  const base = { language: "ar", style: "cinematic", targetDurationSec: 30, aspectRatio: "9:16" };

  it("turns an idea into an Arabic script with structured scenes", async () => {
    const { result, usage } = await mockTextProvider.generateScript({ ...base, startType: "idea", input: "طفل يكتشف مدينة قديمة تحت الرمال" });
    expect(result.scenes.length).toBe(5);
    expect(result.scenes[0].title).toBe("الافتتاحية");
    expect(result.scenes.at(-1)!.title).toBe("الخاتمة");
    for (const s of result.scenes) {
      expect(s.narration).toContain("مدينة قديمة");
      expect(s.camera).not.toBe("");
      expect(s.shots.length).toBe(2);
      expect(s.durationSec).toBeGreaterThan(0);
    }
    expect(usage.units).toBeGreaterThan(0);
  });

  it("is deterministic", async () => {
    const req = { ...base, startType: "idea" as const, input: "فكرة" + "ثابتة" };
    expect(await mockTextProvider.generateScript(req)).toEqual(await mockTextProvider.generateScript(req));
  });

  it("splits pasted Arabic text into scenes in order, keeping the user's words", async () => {
    const input = "كان يا ما كان. عاشت سلمى في قرية صغيرة! هل تعرفون ماذا حدث؟\nذهبت إلى السوق.";
    expect(splitSentences(input)).toEqual(["كان يا ما كان.", "عاشت سلمى في قرية صغيرة!", "هل تعرفون ماذا حدث؟", "ذهبت إلى السوق."]);
    const { result } = await mockTextProvider.generateScript({ ...base, startType: "text", input });
    expect(result.scenes.map((s) => s.narration)).toEqual(splitSentences(input));
    expect(result.body).toBe(input);
  });

  it("caps very long text at 12 scenes without dropping text", async () => {
    const input = Array.from({ length: 40 }, (_, i) => `الجملة رقم ${i + 1}.`).join(" ");
    const { result } = await mockTextProvider.generateScript({ ...base, startType: "text", input });
    expect(result.scenes.length).toBeLessThanOrEqual(12);
    expect(result.scenes.map((s) => s.narration).join(" ")).toBe(input);
  });

  it("rejects empty input", async () => {
    await expect(mockTextProvider.generateScript({ ...base, startType: "idea", input: "  " })).rejects.toThrow();
  });
});

describe("mock image provider", () => {
  it("returns an SVG of the requested size with escaped text", async () => {
    const { result } = await mockImageProvider.generateImage({ prompt: "<script>x</script>", width: 324, height: 576, style: "cinematic", label: "مشهد 1" });
    const svg = new TextDecoder().decode(result.bytes);
    expect(result.mimeType).toBe("image/svg+xml");
    expect(svg).toContain('width="324"');
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("مشهد 1");
  });
});

describe("provider registry", () => {
  it("has a mock for every capability and all cost zero", () => {
    const caps = ["text", "image", "video", "voice", "stt", "lipsync", "music"] as const;
    for (const c of caps) expect(getProvider(c).info.isMock).toBe(true);
    expect(listProviders().every((p) => p.isMock && p.pricing.unitPriceUsd === 0)).toBe(true);
  });
});

describe("identity mocks", () => {
  it("voice mock returns a real WAV that follows text length and speed", async () => {
    const { mockVoiceProvider } = await import("@/providers/mock/voice");
    const short = await mockVoiceProvider.synthesize({ text: "مرحبا", voiceId: "", language: "ar" });
    const long = await mockVoiceProvider.synthesize({ text: "مرحبا يا أصدقائي كيف حالكم اليوم في الصف", voiceId: "", language: "ar" });
    const fast = await mockVoiceProvider.synthesize({ text: "مرحبا يا أصدقائي كيف حالكم اليوم في الصف", voiceId: "", language: "ar", speed: 2 });
    expect(new TextDecoder().decode(short.result.bytes.slice(0, 4))).toBe("RIFF");
    expect(long.result.durationSec).toBeGreaterThan(short.result.durationSec!);
    expect(fast.result.durationSec).toBeLessThan(long.result.durationSec!);
  });

  it("answer mock quotes the passages and redirects when nothing matches", async () => {
    const { mockTextProvider } = await import("@/providers/mock/text");
    const base = { characterName: "سالمة", speakingStyle: "", personality: "", history: [], language: "ar", dialect: "", topics: ["الخبز", "اللبن"] };
    const hit = await mockTextProvider.answer({ ...base, question: "مم يصنع الخبز؟", passages: [{ title: "الدرس", text: "يُصنع الخبز من الدقيق والماء. ثم يُخبز في الفرن." }] });
    expect(hit.result.inScope).toBe(true);
    expect(hit.result.text).toContain("الدقيق");
    const miss = await mockTextProvider.answer({ ...base, question: "من فاز بالمباراة؟", passages: [] });
    expect(miss.result.inScope).toBe(false);
    expect(miss.result.text).toContain("الخبز");
  });

  it("talking-avatar mock keeps the image and makes a playable MP4 (FFmpeg)", async () => {
    const { hasFfmpeg } = await import("@/lib/ffmpeg");
    if (!(await hasFfmpeg())) return;
    const { mockLipSyncProvider } = await import("@/providers/mock/lipsync");
    const { mockVoiceProvider } = await import("@/providers/mock/voice");
    const { placeholderSvg } = await import("@/providers/mock/image");
    const audio = await mockVoiceProvider.synthesize({ text: "مرحبا يا أصدقائي", voiceId: "", language: "ar" });
    const svg = new TextEncoder().encode(placeholderSvg({ prompt: "x", width: 320, height: 400, seed: "s", label: "سالمة" }));
    const out = await mockLipSyncProvider.lipSync({ image: { bytes: svg, mimeType: "image/svg+xml" }, audio: { ...audio.result } });
    expect(out.result.mimeType).toBe("video/mp4");
    expect(new TextDecoder().decode(out.result.bytes.slice(4, 8))).toBe("ftyp");
    expect(mockLipSyncProvider.info.support?.lipSync?.level).toBe("none");
  }, 30000);
});
