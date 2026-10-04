import { describe, expect, it } from "vitest";
import { normalizeArabic, rankPassages, skeleton, stem, tokens } from "@/lib/arabic";

const kb = [
  "يُصنع الخبز من الدقيق والماء والخميرة.",
  "يُخبز العجين في الفرن حتى يصبح ذهبيًّا.",
  "اللبن يأتي من البقرة، ونشربه لأنه مفيد للعظام.",
  "تعيش سالمة في قرية قرب البحر في عُمان.",
].map((text, i) => ({ id: String(i), entryId: "e", title: "", text }));

describe("arabic matching", () => {
  it("normalizes diacritics and letter forms", () => {
    expect(normalizeArabic("يُصْنَعُ الخُبْزُ؟")).toBe("يصنع الخبز");
    expect(normalizeArabic("مدرسة إلى")).toBe("مدرسه الي");
    expect(tokens("ما هو الخبز؟")).toEqual(["الخبز"]);
  });
  it("stems and skeletons catch derived forms", () => {
    expect(stem("والخبز")).toBe("خبز");
    expect(skeleton(stem(normalizeArabic("صناعة")))).toBe(skeleton(stem("يصنع")));
  });
  it("finds the right passage for paraphrased questions", () => {
    const top = (q: string) => rankPassages(q, kb).results[0]?.id;
    expect(top("مم يُصنع الخبز؟")).toBe("0");
    expect(top("ما مكونات صناعة الخبز")).toBe("0");
    expect(top("أين يخبزون العجين؟")).toBe("1");
    expect(top("لماذا نشرب اللبن")).toBe("2");
    expect(top("وين تعيش سالمة؟")).toBe("3");
    expect(rankPassages("من فاز بالمباراة أمس؟", kb).results).toHaveLength(0);
  });
});
