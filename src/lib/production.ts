import type { Db } from "@/db/client";
import { getAsset } from "./assets";
import { getScene, type Scene } from "./scenes";
import type { Motion } from "@/config/motion";

/** Scene media (scene reference image, voice-over/SFX), project music, brand kit, local AI director. */

async function requireAsset(db: Db, id: string, kind: "image" | "audio", workspaceId: string) {
  const a = await getAsset(db, id);
  if (!a || a.kind !== kind || a.workspace_id !== workspaceId) throw new Error(kind === "image" ? "الصورة غير صالحة" : "الملف الصوتي غير صالح");
  return a;
}

async function workspaceOfProject(db: Db, projectId: string) {
  const [p] = await db.query<{ workspace_id: string }>(`select workspace_id from projects where id=$1`, [projectId]);
  if (!p) throw new Error("المشروع غير موجود");
  return p.workspace_id;
}

export async function setSceneMedia(db: Db, sceneId: string, field: "reference_asset_id" | "audio_asset_id", assetId: string | null) {
  const scene = await getScene(db, sceneId);
  if (!scene) throw new Error("المشهد غير موجود");
  if (assetId) await requireAsset(db, assetId, field === "audio_asset_id" ? "audio" : "image", await workspaceOfProject(db, scene.project_id));
  await db.query(`update scenes set ${field}=$2, updated_at=now() where id=$1`, [sceneId, assetId]);
}

export async function setProjectMusic(db: Db, projectId: string, assetId: string | null, volume?: number) {
  const ws = await workspaceOfProject(db, projectId);
  if (assetId) await requireAsset(db, assetId, "audio", ws);
  if (volume !== undefined && !(volume >= 0 && volume <= 1)) throw new Error("مستوى الموسيقى بين 0 و1");
  await db.query(`update projects set music_asset_id=$2, music_volume=coalesce($3, music_volume), updated_at=now() where id=$1`, [projectId, assetId, volume ?? null]);
}

// ---------- Brand kit ----------
export interface BrandKit { workspace_id: string; name: string; primary_color: string; text_color: string; logo_asset_id: string | null; watermark: string; cta: string }
const HEX = /^#[0-9a-f]{6}$/i;

export async function getBrandKit(db: Db, workspaceId: string): Promise<BrandKit> {
  const [k] = await db.query<BrandKit>(`select * from brand_kits where workspace_id=$1`, [workspaceId]);
  return k ?? { workspace_id: workspaceId, name: "", primary_color: "#0e8a8a", text_color: "#ffffff", logo_asset_id: null, watermark: "", cta: "" };
}

export async function saveBrandKit(db: Db, workspaceId: string, patch: Partial<Omit<BrandKit, "workspace_id">>) {
  const k = { ...(await getBrandKit(db, workspaceId)), ...patch };
  if (!HEX.test(k.primary_color) || !HEX.test(k.text_color)) throw new Error("اكتبي اللون بصيغة ‎#RRGGBB");
  if (k.logo_asset_id) await requireAsset(db, k.logo_asset_id, "image", workspaceId);
  const t = (s: string, n: number) => s.trim().slice(0, n);
  await db.query(
    `insert into brand_kits(workspace_id, name, primary_color, text_color, logo_asset_id, watermark, cta) values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (workspace_id) do update set name=$2, primary_color=$3, text_color=$4, logo_asset_id=$5, watermark=$6, cta=$7, updated_at=now()`,
    [workspaceId, t(k.name, 80), k.primary_color, k.text_color, k.logo_asset_id, t(k.watermark, 60), t(k.cta, 120)]);
  return getBrandKit(db, workspaceId);
}

// ---------- AI Director (local rules) ----------
/**
 * Suggests camera and motion per scene from its role in the story and its mood, with plain
 * rules (no AI call, no cost). Only fills empty camera fields and "none" motions, so the
 * creator's own choices are never overwritten.
 */
export function directSuggestion(scene: Pick<Scene, "position" | "mood" | "description" | "dialogue">, total: number): { camera: string; motion: Motion } {
  const text = `${scene.mood} ${scene.description}`;
  if (scene.position === 1) return { camera: "لقطة واسعة تأسيسية", motion: "zoom_in" };
  if (scene.position === total) return { camera: "لقطة واسعة ختامية", motion: "zoom_out" };
  if (scene.dialogue.trim()) return { camera: "لقطة قريبة على المتحدث", motion: "zoom_in" };
  if (/توتر|خوف|مفاج|سريع|ركض/.test(text)) return { camera: "لقطة متوسطة بزاوية منخفضة", motion: "pan_right" };
  if (/هدوء|حنين|تأمل|حزن/.test(text)) return { camera: "لقطة متوسطة ثابتة", motion: "zoom_out" };
  return { camera: "لقطة متوسطة", motion: scene.position % 2 ? "pan_left" : "pan_right" };
}

export async function autoDirect(db: Db, projectId: string) {
  const scenes = await db.query<Scene>(`select * from scenes where project_id=$1 order by position`, [projectId]);
  let changed = 0;
  for (const s of scenes) {
    const sug = directSuggestion(s, scenes.length);
    const camera = s.camera.trim() ? s.camera : sug.camera;
    const motion = s.motion === "none" ? sug.motion : s.motion;
    if (camera !== s.camera || motion !== s.motion) {
      await db.query(`update scenes set camera=$2, motion=$3, updated_at=now() where id=$1`, [s.id, camera, motion]);
      changed++;
    }
  }
  return changed;
}
