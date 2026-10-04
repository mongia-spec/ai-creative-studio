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
