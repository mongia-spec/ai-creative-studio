import { describe, expect, it } from "vitest";
import { PLATFORM_PRESETS, getPreset } from "@/config/platform-presets";
import { START_OPTIONS } from "@/config/start-options";

describe("platform presets", () => {
  it("have unique ids and dimensions that match the aspect ratio", () => {
    expect(new Set(PLATFORM_PRESETS.map((p) => p.id)).size).toBe(PLATFORM_PRESETS.length);
    for (const p of PLATFORM_PRESETS) {
      const [w, h] = p.aspectRatio.split(":").map(Number);
      expect(p.width / p.height).toBeCloseTo(w / h, 3);
      expect(p.defaultDurationSec).toBeLessThanOrEqual(p.maxDurationSec);
    }
  });
  it("throws on unknown preset", () => {
    expect(() => getPreset("nope")).toThrow();
  });
});

describe("start options", () => {
  it("only Idea and Text are marked working in Phase 1", () => {
    expect(START_OPTIONS.filter((o) => o.status === "WORKING").map((o) => o.id)).toEqual(["idea", "text"]);
  });
});
