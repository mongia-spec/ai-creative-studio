import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import type { Db } from "@/db/client";
import { freshEnv } from "./helpers";
import { createProject } from "@/lib/projects";
import { generateScript } from "@/lib/studio";
import { listScenes } from "@/lib/scenes";
import { createCharacter, listReferences } from "@/lib/characters";
import { approvePlan, buildPlan, runPlan } from "@/lib/generation";
import { setProviderOverride } from "@/providers/registry";
import { falImageProvider, falVideoProvider } from "@/providers/fal/adapters";
import { mockVideoProvider } from "@/providers/mock/other";
import { mockImageProvider } from "@/providers/mock/image";
import type { ImageProvider, VideoProvider } from "@/providers/types";
import { hasFfmpeg } from "@/lib/ffmpeg";

let db: Db, ws: string;
beforeEach(async () => { ({ db, workspaceId: ws } = await freshEnv()); });
afterEach(() => { setProviderOverride("image", null); setProviderOverride("video", null); delete process.env.FAL_KEY; });

const png = () => new Uint8Array(execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=teal:s=64x64", "-frames:v", "1", "-f", "image2pipe", "-c:v", "png", "-"]));

/** Priced fakes that behave like a paid vendor but cost nothing (no network). */
const pricedImage: ImageProvider = {
  info: { ...mockImageProvider.info, id: "fake-paid-image", isMock: false, pricing: { unitType: "images", unitPriceUsd: 0.03 } },
  async generateImage(req) { return { result: { bytes: png(), mimeType: "image/png", width: req.width, height: req.height }, usage: { units: 1, unitType: "images", unitPriceUsd: 0.03 } }; },
};
const pricedVideo: VideoProvider = {
  info: { ...mockVideoProvider.info, id: "fake-paid-video", isMock: false, pricing: { unitType: "seconds", unitPriceUsd: 0.04, byResolution: { "480p": 0.04, "720p": 0.08 } } },
  async generateVideo(req) { const r = await mockVideoProvider.generateVideo(req); return { ...r, usage: { ...r.usage, unitPriceUsd: req.resolution === "720p" ? 0.08 : 0.04 } }; },
};

async function story() {
  const p = await createProject(db, { workspaceId: ws, startType: "text", platformPreset: "youtube-video", inputText: "ذهبت ليلى إلى السوق. اشترت ليلى التفاح. عادت ليلى إلى البيت." });
  await generateScript(db, p.id);
  const c = await createCharacter(db, ws, { name: "ليلى", description: "طفلة بضفيرتين وفستان أصفر" });
  const scenes = await listScenes(db, p.id);
  for (const s of scenes) await db.query(`insert into scene_characters(scene_id, character_id) values ($1,$2) on conflict do nothing`, [s.id, c.id]);
  return { p, c, scenes };
}

describe("generation plan, approval and spending cap (vendor-neutral)", () => {
  it("prices only what is missing, needs approval for paid work, and stops before the cap", async () => {
    if (!(await hasFfmpeg())) return;
    setProviderOverride("image", pricedImage); setProviderOverride("video", pricedVideo);
    const { p, c, scenes } = await story();
    const plan = await buildPlan(db, p.id, "draft");
    const secs = scenes.reduce((a, s) => a + Math.min(10, Number(s.duration_sec)), 0);
    expect(plan.live).toBe(true);
    expect(plan.items.filter((i) => i.kind === "character").length).toBe(1);
    expect(plan.items.filter((i) => i.kind === "keyframe").length).toBe(scenes.length);
    expect(plan.costUsd).toBeCloseTo(0.03 + 0.03 * scenes.length + 0.04 * secs, 2);
    expect(plan.totalUsd).toBeCloseTo(plan.costUsd + 0.5 * (plan.costUsd - 0.03), 2);
    expect((await buildPlan(db, p.id, "standard")).costUsd).toBeGreaterThan(plan.costUsd);

    await expect(runPlan(db, p.id)).rejects.toThrow("موافقتك");
    await expect(approvePlan(db, p.id, "wrong", 1, "draft")).rejects.toThrow("تغيّرت الخطة");
    // A cap that covers the character and two pictures only.
    await approvePlan(db, p.id, plan.hash, 0.1, "draft");
    const r = await runPlan(db, p.id);
    expect(r.stopped).toBe("cap");
    expect(r.done.map((d) => d.kind)).toEqual(["character", "keyframe", "keyframe"]);
    expect(r.spentUsd).toBeCloseTo(0.09, 3);
    expect(r.spentUsd).toBeLessThanOrEqual(0.1);
    expect((await listReferences(db, c.id)).length).toBe(1);
    // The remaining work is a new plan: it needs a new approval, and done items are not redone.
    const next = await buildPlan(db, p.id, "draft");
    expect(next.items.some((i) => i.kind === "character")).toBe(false);
    expect(next.items.filter((i) => i.kind === "keyframe").length).toBe(scenes.length - 2);
    await expect(runPlan(db, p.id)).rejects.toThrow("موافقتك");
    await approvePlan(db, p.id, next.hash, 5, "draft");
    const r2 = await runPlan(db, p.id);
    expect(r2.stopped).toBeNull();
    const after = await listScenes(db, p.id);
    expect(after.every((s) => s.video_asset_id && s.visual_source === "ai_video")).toBe(true);
    expect((await buildPlan(db, p.id, "draft")).items.length).toBe(0);
  }, 180000);

  it("mock mode is free, needs no approval and never labels a camera push as AI motion", async () => {
    if (!(await hasFfmpeg())) return;
    const { p } = await story();
    const plan = await buildPlan(db, p.id, "draft");
    expect(plan.live).toBe(false);
    expect(plan.totalUsd).toBe(0);
    const r = await runPlan(db, p.id);
    expect(r.stopped).toBeNull();
    const scenes = await listScenes(db, p.id);
    expect(scenes.every((s) => s.video_asset_id)).toBe(true);
    expect(scenes.some((s) => s.visual_source === "ai_video" || s.visual_source === "ai_image")).toBe(false);
  }, 180000);
});

describe("fal.ai adapters (no network: fetch is faked)", () => {
  it("submits to the queue with the key, polls, downloads and reports the real unit price", async () => {
    process.env.FAL_KEY = "test-key";
    const calls: { url: string; init?: RequestInit }[] = [];
    let polls = 0;
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
      if (url.startsWith("https://queue.fal.run/") && init?.method === "POST") return json({ request_id: "r1", status_url: "https://q/status", response_url: "https://q/result" });
      if (url === "https://q/status") return json({ status: ++polls < 2 ? "IN_PROGRESS" : "COMPLETED" });
      if (url === "https://q/result") return json(url.includes("result") && calls.some((c) => c.url.includes("wan")) ? { video: { url: "https://cdn/v.mp4" } } : { images: [{ url: "https://cdn/i.png", width: 64, height: 64 }] });
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": url.endsWith(".png") ? "image/png" : "video/mp4" } });
    }) as unknown as typeof fetch;

    const img = await falImageProvider(fake).generateImage({ prompt: "x", width: 64, height: 64, style: "cartoon", references: [{ bytes: new Uint8Array([9]), mimeType: "image/png" }] });
    const sub = calls.find((c) => c.init?.method === "POST")!;
    expect(sub.url).toBe("https://queue.fal.run/fal-ai/bytedance/seedream/v4/edit");
    expect((sub.init!.headers as Record<string, string>).Authorization).toBe("Key test-key");
    expect(JSON.parse(String(sub.init!.body)).image_urls[0]).toMatch(/^data:image\/png;base64,/);
    expect(img.usage).toMatchObject({ units: 1, unitPriceUsd: 0.03, externalRef: "r1" });

    calls.length = 0; polls = 0;
    const v = await falVideoProvider(fake).generateVideo({ prompt: "walks", image: { bytes: new Uint8Array([9]), mimeType: "image/png" }, durationSec: 4.5, width: 848, height: 480, resolution: "480p" });
    const body = JSON.parse(String(calls.find((c) => c.init?.method === "POST")!.init!.body));
    expect(body).toMatchObject({ num_frames: 73, frames_per_second: 16, resolution: "480p", aspect_ratio: "16:9" });
    expect(v.usage.units).toBe(4.5);
    expect(v.usage.unitPriceUsd).toBe(0.04);
  });
});
