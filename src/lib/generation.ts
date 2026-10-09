import crypto from "node:crypto";
import type { Db } from "@/db/client";
import { getProvider } from "@/providers/registry";
import type { ProviderInfo } from "@/providers/types";
import { getPreset } from "@/config/platform-presets";
import { getAsset, readAssetBytes, saveAsset } from "./assets";
import { addReference, characterDescriptor, getCharacter } from "./characters";
import { recordProviderCall } from "./cost";
import { sceneIdentityInput } from "./studio";

/**
 * General generation pipeline for any project (story, film, ad, social, lesson):
 *   plan (what is missing + price) → approval with a spending cap → run, stopping before the cap.
 * It only fills gaps: characters without a reference picture, shots without a picture, shots
 * without a clip. Existing assets are never regenerated. Vendor-neutral: it uses the provider
 * interfaces; which vendor answers is the registry's business.
 */

export const QUALITIES = { draft: { label: "مسودة 480p (الأرخص)", resolution: "480p" }, standard: { label: "قياسي 720p", resolution: "720p" } } as const;
export type Quality = keyof typeof QUALITIES;
/** Share of items expected to need one more try (failed motion, wrong hands…), priced in advance. */
export const RETRY_RATE = 0.5;

export interface PlanItem {
  kind: "character" | "keyframe" | "video";
  targetId: string; label: string; units: number; unitPriceUsd: number; costUsd: number; provider: string; mock: boolean;
}
export interface Plan {
  projectId: string; quality: Quality; items: PlanItem[];
  costUsd: number; retryUsd: number; totalUsd: number; live: boolean; hash: string;
  providers: Pick<ProviderInfo, "id" | "name" | "isMock" | "commercial">[];
}

const r2 = (n: number) => Math.round(n * 1000) / 1000;
const unitPrice = (p: ProviderInfo, resolution?: string): number => (resolution ? p.pricing.byResolution?.[resolution] : undefined) ?? p.pricing.unitPriceUsd;

async function projectRow(db: Db, projectId: string) {
  const [p] = await db.query<{ id: string; workspace_id: string; quality: Quality; spend_cap_usd: string; generation_approval: { hash: string; capUsd: number; at: string } | null; platform_preset: string; style: string }>(
    `select id, workspace_id, quality, spend_cap_usd, generation_approval, platform_preset, style from projects where id=$1`, [projectId]);
  if (!p) throw new Error("المشروع غير موجود");
  return p;
}

export async function buildPlan(db: Db, projectId: string, quality?: Quality): Promise<Plan> {
  const p = await projectRow(db, projectId);
  const q: Quality = quality ?? p.quality ?? "draft";
  const image = getProvider("image", q === "draft" ? "draft" : "standard").info;
  const video = getProvider("video", q === "draft" ? "draft" : "standard").info;
  const items: PlanItem[] = [];
  const add = (kind: PlanItem["kind"], targetId: string, label: string, units: number, info: ProviderInfo, res?: string) => {
    const u = unitPrice(info, res);
    items.push({ kind, targetId, label, units: r2(units), unitPriceUsd: u, costUsd: r2(u * units), provider: info.id, mock: info.isMock });
  };
  const chars = await db.query<{ id: string; name: string }>(
    `select distinct c.id, c.name from characters c join scene_characters sc on sc.character_id=c.id join scenes s on s.id=sc.scene_id
     where s.project_id=$1 and s.status<>'rejected'
       and not exists (select 1 from character_references r where r.character_id=c.id) order by c.name`, [projectId]);
  for (const c of chars) add("character", c.id, `صورة مرجعية للشخصية «${c.name}»`, 1, image);
  const scenes = await db.query<{ id: string; position: number; duration_sec: string; visual_source: string | null; preview_asset_id: string | null; video_asset_id: string | null }>(
    `select id, position, duration_sec, visual_source, preview_asset_id, video_asset_id from scenes where project_id=$1 and status<>'rejected' order by position`, [projectId]);
  const maxClip = video.limits?.maxSecondsPerClip ?? 10;
  for (const s of scenes) {
    if (!s.preview_asset_id || s.visual_source === null || s.visual_source === "placeholder" || s.visual_source === "character") add("keyframe", s.id, `الإطار الأول للّقطة ${s.position}`, 1, image);
    if (!s.video_asset_id) add("video", s.id, `حركة اللقطة ${s.position}`, Math.min(maxClip, Math.max(1, Number(s.duration_sec))), video, QUALITIES[q].resolution);
  }
  const costUsd = r2(items.reduce((a, i) => a + i.costUsd, 0));
  const retryUsd = r2(items.filter((i) => i.kind !== "character").reduce((a, i) => a + i.costUsd, 0) * RETRY_RATE);
  const live = items.some((i) => !i.mock);
  const hash = crypto.createHash("sha256").update(JSON.stringify([q, items.map((i) => [i.kind, i.targetId, i.units, i.unitPriceUsd, i.provider])])).digest("hex").slice(0, 16);
  return {
    projectId, quality: q, items, costUsd, retryUsd, totalUsd: r2(costUsd + retryUsd), live, hash,
    providers: [image, video].map(({ id, name, isMock, commercial }) => ({ id, name, isMock, commercial })),
  };
}

/** The user approves this exact plan and a cap; any change in the plan needs a new approval. */
export async function approvePlan(db: Db, projectId: string, hash: string, capUsd: number, quality: Quality) {
  if (!(capUsd >= 0) || capUsd > 500) throw new Error("حدّ الإنفاق يجب أن يكون بين 0 و500 دولار");
  const plan = await buildPlan(db, projectId, quality);
  if (plan.hash !== hash) throw new Error("تغيّرت الخطة منذ عرضها. راجعي التقدير الجديد ثم وافقي عليه.");
  await db.query(`update projects set quality=$2, spend_cap_usd=$3, generation_approval=$4, updated_at=now() where id=$1`,
    [projectId, quality, capUsd, JSON.stringify({ hash, capUsd, at: new Date().toISOString() })]);
  return plan;
}

export async function spentSinceApproval(db: Db, projectId: string, since: string) {
  const [r] = await db.query<{ s: string }>(`select coalesce(sum(cost_usd),0) s from provider_calls where project_id=$1 and created_at >= $2`, [projectId, since]);
  return Number(r.s);
}

export interface RunReport { done: { kind: PlanItem["kind"]; label: string; costUsd: number }[]; spentUsd: number; stopped: null | "cap" | "error"; message: string | null }

export async function runPlan(db: Db, projectId: string): Promise<RunReport> {
  const p = await projectRow(db, projectId);
  const plan = await buildPlan(db, projectId);
  const approval = p.generation_approval;
  if (plan.live && (!approval || approval.hash !== plan.hash)) throw new Error("التوليد المدفوع يحتاج موافقتك على هذه الخطة وحدّ الإنفاق أولًا.");
  const cap = plan.live ? Number(approval!.capUsd) : Infinity;
  const since = approval?.at ?? new Date(0).toISOString();
  const preset = getPreset(p.platform_preset);
  const res = QUALITIES[plan.quality].resolution;
  const scale = (res === "480p" ? 480 : 720) / Math.min(preset.width, preset.height);
  const size = { width: Math.round((preset.width * scale) / 16) * 16, height: Math.round((preset.height * scale) / 16) * 16 };
  const report: RunReport = { done: [], spentUsd: 0, stopped: null, message: null };
  const imageP = getProvider("image", plan.quality === "draft" ? "draft" : "standard");
  const videoP = getProvider("video", plan.quality === "draft" ? "draft" : "standard");

  // Characters first (their pictures are the references for every shot), then pictures, then motion.
  const order = ["character", "keyframe", "video"] as const;
  for (const kind of order) for (const item of plan.items.filter((i) => i.kind === kind)) {
    const spent = await spentSinceApproval(db, projectId, since);
    report.spentUsd = spent;
    if (spent + item.costUsd > cap + 1e-9) {
      report.stopped = "cap";
      report.message = `توقّف التوليد قبل «${item.label}»: سيتجاوز حدّ الإنفاق (${cap}$). المنفق: ${r2(spent)}$. وافقي على حدّ جديد للمتابعة.`;
      return report;
    }
    try {
      if (kind === "character") {
        const c = (await getCharacter(db, item.targetId))!;
        const { result, usage } = await imageP.generateImage({
          prompt: `Character reference sheet, full body, neutral pose, plain background. ${characterDescriptor(c)}`,
          style: p.style, width: 768, height: 1024, label: c.name, seed: `char:${c.id}`,
        });
        await recordProviderCall(db, { workspaceId: p.workspace_id, projectId, provider: imageP.info, usage });
        const a = await saveAsset(db, { workspaceId: p.workspace_id, projectId, source: "generated", name: `character-${c.name}`, mimeType: result.mimeType, bytes: result.bytes, width: result.width, height: result.height, providerRef: { provider: imageP.info.id } });
        await addReference(db, c.id, a.id, "primary");
      } else if (kind === "keyframe") {
        const [scene] = await db.query<import("./scenes").Scene>(`select * from scenes where id=$1`, [item.targetId]);
        const { prompt, referenceAssetIds } = await sceneIdentityInput(db, scene);
        const references = [];
        for (const id of referenceAssetIds.slice(0, 10)) { const a = await getAsset(db, id); if (a && a.kind === "image") references.push({ bytes: await readAssetBytes(a), mimeType: a.mime_type }); }
        const { result, usage } = await imageP.generateImage({
          prompt: `${prompt}\nFirst frame of a video shot. No text, no talking.`, style: p.style, ...size,
          label: `لقطة ${scene.position}`, seed: `kf:${scene.id}`, referenceAssetIds, references,
        });
        await recordProviderCall(db, { workspaceId: p.workspace_id, projectId, provider: imageP.info, usage });
        const a = await saveAsset(db, { workspaceId: p.workspace_id, projectId, source: "generated", name: `keyframe-${scene.position}`, mimeType: result.mimeType, bytes: result.bytes, width: result.width, height: result.height, providerRef: { provider: imageP.info.id } });
        await db.query(`update scenes set preview_asset_id=$2, visual_source=$3, updated_at=now() where id=$1`, [scene.id, a.id, imageP.info.isMock ? "placeholder" : "ai_image"]);
      } else {
        const [scene] = await db.query<import("./scenes").Scene>(`select * from scenes where id=$1`, [item.targetId]);
        const frame = scene.preview_asset_id ? await getAsset(db, scene.preview_asset_id) : null;
        if (!frame) throw new Error(`اللقطة ${scene.position} بلا إطار أول`);
        const { result, usage } = await videoP.generateVideo({
          prompt: scene.motion_prompt || scene.visual_prompt || scene.description,
          negativePrompt: "talking, lip movement, mouth moving, text, subtitles, extra people, deformed hands",
          image: { bytes: await readAssetBytes(frame), mimeType: frame.mime_type }, durationSec: item.units, ...size, resolution: res,
        });
        await recordProviderCall(db, { workspaceId: p.workspace_id, projectId, provider: videoP.info, usage });
        if (!result.bytes.byteLength) throw new Error("لم يُرجع مزوّد الفيديو مقطعًا");
        const a = await saveAsset(db, { workspaceId: p.workspace_id, projectId, source: "generated", name: `shot-${scene.position}`, mimeType: "video/mp4", bytes: result.bytes, durationSec: result.durationSec, providerRef: { provider: videoP.info.id } });
        // Mock clips are only a camera push on the picture: kept as such, never labelled AI motion.
        await db.query(`update scenes set video_asset_id=$2, video_start=0, motion='none', visual_source=$3, updated_at=now() where id=$1`,
          [scene.id, a.id, videoP.info.isMock ? (scene.visual_source ?? "placeholder") : "ai_video"]);
      }
      report.done.push({ kind, label: item.label, costUsd: item.costUsd });
    } catch (e) {
      report.stopped = "error";
      report.message = `فشل «${item.label}»: ${e instanceof Error ? e.message : "خطأ"}. ما أُنجز محفوظ، ولن يُعاد توليده.`;
      report.spentUsd = await spentSinceApproval(db, projectId, since);
      return report;
    }
  }
  report.spentUsd = await spentSinceApproval(db, projectId, since);
  return report;
}
