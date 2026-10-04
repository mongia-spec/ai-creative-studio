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
  /** What applies in this scene, and the scene position each value comes from. */
  effective: Partial<Record<StateKey, { value: string; fromPosition: number }>>;
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
  const rows = await db.query<{ scene_id: string; position: number; state: CharacterState } & Pick<Character, "name" | "description" | "attributes" | "locked"> & { character_id: string }>(
    `select sc.scene_id, s.position, sc.state, sc.character_id, c.name, c.description, c.attributes, c.locked
     from scene_characters sc join scenes s on s.id=sc.scene_id join characters c on c.id=sc.character_id
     where s.project_id=$1 order by s.position, lower(c.name)`, [projectId]);
  const scenes = await db.query<{ id: string }>(`select id from scenes where project_id=$1 order by position`, [projectId]);
  const out: Record<string, SceneCast[]> = Object.fromEntries(scenes.map((s) => [s.id, []]));
  const carried = new Map<string, SceneCast["effective"]>(); // character → state so far
  for (const r of rows) {
    const prev = { ...(carried.get(r.character_id) ?? {}) };
    for (const [k, v] of Object.entries(r.state ?? {})) if (v) prev[k as StateKey] = { value: v, fromPosition: r.position };
    carried.set(r.character_id, prev);
    out[r.scene_id].push({
      characterId: r.character_id, name: r.name, locked: r.locked,
      descriptor: characterDescriptor(r), own: r.state ?? {}, effective: prev,
    });
  }
  return out;
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
