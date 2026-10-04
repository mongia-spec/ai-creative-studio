import type { Db } from "@/db/client";
import { characterDescriptor, type Character } from "./characters";
import type { Scene } from "./scenes";

/**
 * Scene memory: which characters are in each scene, and continuity that carries forward.
 * A change recorded in scene N (e.g. wardrobe) applies to that character in every later
 * scene until another scene changes it.
 */
import { STATE_FIELDS, type StateKey } from "@/config/memory-fields";
export { STATE_FIELDS, type StateKey };
export type CharacterState = Partial<Record<StateKey, string>>;

export interface SceneCast {
  characterId: string;
  name: string;
  locked: boolean;
  descriptor: string;
  /** Changes recorded in this scene. */
  own: CharacterState;
  /** Outfit pinned in this scene (null = inherit). */
  outfitId: string | null;
  /** What applies in this scene, and the scene position each value comes from. */
  effective: Partial<Record<StateKey, { value: string; fromPosition: number }>>;
  /** Outfit in effect here (pinned here or carried from an earlier scene). */
  effectiveOutfit: { id: string; name: string; assetId: string | null; fromPosition: number } | null;
}

function cleanState(s: Record<string, unknown>): CharacterState {
  const out: CharacterState = {};
  for (const [k] of STATE_FIELDS) {
    const v = s[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 300);
  }
  return out;
}

async function sceneProject(db: Db, sceneId: string) {
  const [r] = await db.query<{ project_id: string; workspace_id: string }>(
    `select s.project_id, p.workspace_id from scenes s join projects p on p.id=s.project_id where s.id=$1`, [sceneId]);
  if (!r) throw new Error("المشهد غير موجود");
  return r;
}

/** Replace the cast of a scene. Characters that stay keep their recorded state. */
export async function setSceneCharacters(db: Db, sceneId: string, characterIds: string[]) {
  const { workspace_id } = await sceneProject(db, sceneId);
  const ids = [...new Set(characterIds)];
  await db.transaction(async (tx) => {
    if (ids.length) {
      const ok = await tx.query<{ id: string }>(`select id from characters where workspace_id=$1 and id = any($2::uuid[])`, [workspace_id, ids]);
      if (ok.length !== ids.length) throw new Error("شخصية غير معروفة");
    }
    await tx.query(`delete from scene_characters where scene_id=$1 and not (character_id = any($2::uuid[]))`, [sceneId, ids]);
    for (const id of ids) {
      await tx.query(`insert into scene_characters(scene_id, character_id) values ($1,$2) on conflict do nothing`, [sceneId, id]);
    }
    await tx.query(`update scenes set updated_at=now() where id=$1`, [sceneId]);
  });
}

export async function setCharacterState(db: Db, sceneId: string, characterId: string, state: Record<string, unknown>) {
  const rows = await db.query(
    `update scene_characters set state=$3 where scene_id=$1 and character_id=$2 returning 1`,
    [sceneId, characterId, JSON.stringify(cleanState(state))]);
  if (!rows.length) throw new Error("الشخصية ليست في هذا المشهد");
  await db.query(`update scenes set updated_at=now() where id=$1`, [sceneId]);
}

/** Cast and resolved continuity for every scene of a project, in scene order. */
export async function getProjectMemory(db: Db, projectId: string): Promise<Record<string, SceneCast[]>> {
  const rows = await db.query<{
    scene_id: string; position: number; state: CharacterState; character_id: string; outfit_id: string | null;
    outfit_name: string | null; outfit_description: string | null; outfit_asset_id: string | null;
  } & Pick<Character, "name" | "description" | "attributes" | "locked">>(
    `select sc.scene_id, s.position, sc.state, sc.character_id, sc.outfit_id, c.name, c.description, c.attributes, c.locked,
       o.name outfit_name, o.description outfit_description, o.asset_id outfit_asset_id
     from scene_characters sc join scenes s on s.id=sc.scene_id join characters c on c.id=sc.character_id
     left join character_outfits o on o.id=sc.outfit_id
     where s.project_id=$1 order by s.position, lower(c.name)`, [projectId]);
  const scenes = await db.query<{ id: string }>(`select id from scenes where project_id=$1 order by position`, [projectId]);
  const out: Record<string, SceneCast[]> = Object.fromEntries(scenes.map((s) => [s.id, []]));
  // Per character: state so far, and outfit so far.
  const carried = new Map<string, { effective: SceneCast["effective"]; outfit: SceneCast["effectiveOutfit"] }>();
  for (const r of rows) {
    const prev = carried.get(r.character_id) ?? { effective: {}, outfit: null };
    const effective = { ...prev.effective };
    let outfit = prev.outfit;
    if (r.outfit_id) {
      // Pinning an outfit resets wardrobe to that outfit.
      outfit = { id: r.outfit_id, name: r.outfit_name!, assetId: r.outfit_asset_id, fromPosition: r.position };
      effective.wardrobe = { value: r.outfit_description ? `${r.outfit_name} (${r.outfit_description})` : r.outfit_name!, fromPosition: r.position };
    }
    for (const [k, v] of Object.entries(r.state ?? {})) if (v) effective[k as StateKey] = { value: v, fromPosition: r.position };
    carried.set(r.character_id, { effective, outfit });
    out[r.scene_id].push({
      characterId: r.character_id, name: r.name, locked: r.locked, descriptor: characterDescriptor(r),
      own: r.state ?? {}, outfitId: r.outfit_id, effective, effectiveOutfit: outfit,
    });
  }
  return out;
}

/** Pin (or clear) an outfit for a character in one scene. */
export async function setSceneOutfit(db: Db, sceneId: string, characterId: string, outfitId: string | null) {
  if (outfitId) {
    const [o] = await db.query(`select 1 from character_outfits where id=$1 and character_id=$2`, [outfitId, characterId]);
    if (!o) throw new Error("الزي لا يخص هذه الشخصية");
  }
  const rows = await db.query(`update scene_characters set outfit_id=$3 where scene_id=$1 and character_id=$2 returning 1`, [sceneId, characterId, outfitId]);
  if (!rows.length) throw new Error("الشخصية ليست في هذا المشهد");
  await db.query(`update scenes set updated_at=now() where id=$1`, [sceneId]);
}

/**
 * Outfit lock for a range of scenes: pins the outfit in every scene from..to where the
 * character appears, and clears wardrobe overrides there so nothing changes it by accident.
 */
export async function lockOutfitForScenes(db: Db, projectId: string, characterId: string, outfitId: string, fromPos: number, toPos: number) {
  const [o] = await db.query(`select 1 from character_outfits where id=$1 and character_id=$2`, [outfitId, characterId]);
  if (!o) throw new Error("الزي لا يخص هذه الشخصية");
  if (!(fromPos >= 1 && toPos >= fromPos)) throw new Error("نطاق مشاهد غير صالح");
  const rows = await db.query(
    `update scene_characters sc set outfit_id=$3, state = sc.state - 'wardrobe'
     from scenes s where s.id=sc.scene_id and s.project_id=$1 and sc.character_id=$2 and s.position between $4 and $5 returning 1`,
    [projectId, characterId, outfitId, fromPos, toPos]);
  return rows.length;
}

/** Link workspace characters whose name appears in a scene's text (used after script generation). */
export async function autoLinkCharacters(db: Db, projectId: string) {
  const [p] = await db.query<{ workspace_id: string }>(`select workspace_id from projects where id=$1`, [projectId]);
  const chars = await db.query<{ id: string; name: string }>(`select id, name from characters where workspace_id=$1`, [p.workspace_id]);
  if (!chars.length) return 0;
  const scenes = await db.query<Scene>(`select * from scenes where project_id=$1`, [projectId]);
  let n = 0;
  for (const s of scenes) {
    const text = [s.title, s.description, s.narration, s.dialogue].join(" ");
    for (const c of chars) {
      if (text.includes(c.name)) {
        const r = await db.query(`insert into scene_characters(scene_id, character_id) values ($1,$2) on conflict do nothing returning 1`, [s.id, c.id]);
        n += r.length;
      }
    }
  }
  return n;
}
