import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import type { Db } from "@/db/client";
import { freshEnv } from "./helpers";
import { createProject, updateProject } from "@/lib/projects";
import { generateScript } from "@/lib/studio";
import { buildPlan, runPlan } from "@/lib/generation";
import { setProviderOverride } from "@/providers/registry";
import { mockImageProvider, placeholderSvg } from "@/providers/mock/image";
import type { ImageProvider, ImageRequest } from "@/providers/types";
import { STYLES } from "@/config/platform-presets";
import { STYLE_OPTIONS, VISUAL_STYLES, getStyle, styleLook } from "@/config/styles";
import { hasFfmpeg } from "@/lib/ffmpeg";

let db: Db, ws: string;
beforeEach(async () => { ({ db, workspaceId: ws } = await freshEnv()); });
afterEach(() => { setProviderOverride("image", null); });

describe("style library", () => {
  it("has unique ids, a provider prompt and a 3-colour palette for every style", () => {
    expect(new Set(VISUAL_STYLES.map((s) => s.id)).size).toBe(VISUAL_STYLES.length);
    for (const s of VISUAL_STYLES) {
      expect(s.prompt.length).toBeGreaterThan(10);
      expect(s.palette.every((c) => /^#[0-9a-f]{6}$/i.test(c))).toBe(true);
    }
    // Old ids stay valid for existing projects, and the classic list is derived from the library.
    for (const id of ["cinematic", "cartoon", "realistic", "watercolor", "documentary"]) expect(getStyle(id).id).toBe(id);
    expect(STYLES.map((s) => s.id)).toEqual(VISUAL_STYLES.map((s) => s.id));
    expect(STYLE_OPTIONS.find((s) => s.id === "chalkboard")!.group).toBe("lesson");
  });

  it("falls back to cinematic for an unknown id and sizes the pixel look to the frame", () => {
    expect(getStyle("nope").id).toBe("cinematic");
    expect(styleLook("realistic", { width: 640, height: 360 })).toBe("");
    expect(styleLook("pixel", { width: 640, height: 360 })).toContain("scale=640:360:flags=neighbor");
  });

  it("every local look is a valid FFmpeg filter that keeps the frame size", async () => {
    if (!(await hasFfmpeg())) return;
    for (const s of VISUAL_STYLES) {
      const vf = `setsar=1${styleLook(s.id, { width: 320, height: 180 })},format=yuv420p`;
      const out = execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=s=320x180:d=1", "-vf", vf, "-frames:v", "1", "-f", "rawvideo", "-"]);
      expect(out.byteLength, s.id).toBe(320 * 180 * 1.5);
    }
  });
});

describe("style in generation", () => {
  it("sends the style prompt (not the bare id) and palette to the image provider, and a style change needs a new approval", async () => {
    const seen: ImageRequest[] = [];
    const spy: ImageProvider = { info: mockImageProvider.info, async generateImage(req) { seen.push(req); return mockImageProvider.generateImage(req); } };
    setProviderOverride("image", spy);
    const p = await createProject(db, { workspaceId: ws, startType: "text", platformPreset: "youtube-video", inputText: "ذهبت ليلى إلى السوق. عادت ليلى إلى البيت.", style: "chalkboard" });
    await generateScript(db, p.id);
    const before = await buildPlan(db, p.id);
    await runPlan(db, p.id);
    const kf = seen.filter((r) => r.seed?.startsWith("kf:"));
    expect(kf.length).toBeGreaterThan(0);
    for (const r of kf) { expect(r.style).toBe(getStyle("chalkboard").prompt); expect(r.palette).toEqual(getStyle("chalkboard").palette); }

    await updateProject(db, p.id, { style: "sand" });
    const after = await buildPlan(db, p.id);
    const again = await buildPlan(db, p.id);
    expect(after.hash).toBe(again.hash);
    await updateProject(db, p.id, { style: "chalkboard" });
    expect((await buildPlan(db, p.id)).hash).not.toBe(after.hash);
    expect(before.hash).not.toBe(after.hash);
  });

  it("mock previews take the style colours", () => {
    const svg = placeholderSvg({ width: 100, height: 100, label: "x", prompt: "y", seed: "z", palette: ["#1e3b2f", "#f5f5f0", "#8fb8a0"] });
    expect(svg).toContain('stop-color="#1e3b2f"');
    expect(placeholderSvg({ width: 100, height: 100, label: "x", prompt: "y", seed: "z" })).toContain("hsl(");
  });
});
