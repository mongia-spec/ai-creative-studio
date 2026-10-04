import type { Db } from "@/db/client";

export interface Scene {
  id: string;
  project_id: string;
  position: number;
  title: string;
  description: string;
  location: string;
  characters_text: string;
  narration: string;
  dialogue: string;
  camera: string;
  lighting: string;
  mood: string;
  duration_sec: number;
  visual_prompt: string;
  audio_notes: string;
  status: "draft" | "approved" | "rejected";
  preview_asset_id: string | null;
}

export const EDITABLE_FIELDS = [
  "title", "description", "location", "characters_text", "narration", "dialogue",
  "camera", "lighting", "mood", "duration_sec", "visual_prompt", "audio_notes",
] as const;
export type SceneEditable = (typeof EDITABLE_FIELDS)[number];

export async function listScenes(db: Db, projectId: string): Promise<Scene[]> {
  const rows = await db.query<Scene>(`select * from scenes where project_id=$1 order by position`, [projectId]);
  return rows.map((r) => ({ ...r, duration_sec: Number(r.duration_sec) }));
}

export async function getScene(db: Db, id: string): Promise<Scene | null> {
  const [s] = await db.query<Scene>(`select * from scenes where id=$1`, [id]);
  return s ? { ...s, duration_sec: Number(s.duration_sec) } : null;
}

async function touch(db: Db, projectId: string) {
  await db.query(`update projects set updated_at=now() where id=$1`, [projectId]);
}

export async function updateScene(db: Db, id: string, patch: Partial<Record<SceneEditable, string | number>>) {
  const scene = await getScene(db, id);
  if (!scene) throw new Error("المشهد غير موجود");
  for (const k of EDITABLE_FIELDS) {
    if (patch[k] === undefined) continue;
    let v: string | number = patch[k]!;
    if (k === "duration_sec") {
      v = Number(v);
      if (!(v > 0 && v <= 600)) throw new Error("مدة المشهد يجب أن تكون بين 1 و600 ثانية");
    }
    await db.query(`update scenes set ${k}=$2, updated_at=now() where id=$1`, [id, v]);
  }
  // Editing an approved scene sends it back to draft so it gets reviewed again.
  if (scene.status === "approved") await db.query(`update scenes set status='draft' where id=$1`, [id]);
  await touch(db, scene.project_id);
}

export async function setSceneStatus(db: Db, id: string, status: Scene["status"]) {
  const [s] = await db.query<{ project_id: string }>(`update scenes set status=$2, updated_at=now() where id=$1 returning project_id`, [id, status]);
  if (s) await refreshProjectStatus(db, s.project_id);
}

export async function approveAll(db: Db, projectId: string) {
  await db.query(`update scenes set status='approved', updated_at=now() where project_id=$1 and status <> 'rejected'`, [projectId]);
  await refreshProjectStatus(db, projectId);
}

/** Project is "approved" when it has scenes and every non-rejected scene is approved. */
async function refreshProjectStatus(db: Db, projectId: string) {
  const [r] = await db.query<{ total: number; pending: number }>(
    `select count(*) filter (where status<>'rejected')::int total, count(*) filter (where status='draft')::int pending from scenes where project_id=$1`, [projectId]);
  const status = r.total > 0 && r.pending === 0 ? "approved" : r.total > 0 ? "storyboard_ready" : "draft";
  await db.query(`update projects set status=$2, updated_at=now() where id=$1 and status <> 'archived'`, [projectId, status]);
}

export async function addScene(db: Db, projectId: string, afterPosition?: number): Promise<Scene> {
  return db.transaction(async (tx) => {
    const [{ max }] = await tx.query<{ max: number }>(`select coalesce(max(position),0) max from scenes where project_id=$1`, [projectId]);
    const pos = afterPosition === undefined ? max + 1 : afterPosition + 1;
    await tx.query(`update scenes set position=position+1 where project_id=$1 and position>=$2`, [projectId, pos]);
    const [s] = await tx.query<Scene>(`insert into scenes(project_id, position, title) values ($1,$2,'مشهد جديد') returning *`, [projectId, pos]);
    await touch(tx, projectId);
    await refreshProjectStatus(tx, projectId);
    return s;
  });
}

export async function duplicateScene(db: Db, id: string): Promise<Scene> {
  return db.transaction(async (tx) => {
    const [src] = await tx.query<Scene>(`select * from scenes where id=$1`, [id]);
    if (!src) throw new Error("المشهد غير موجود");
    await tx.query(`update scenes set position=position+1 where project_id=$1 and position>$2`, [src.project_id, src.position]);
    const cols = EDITABLE_FIELDS.join(", ");
    const [copy] = await tx.query<Scene>(
      `insert into scenes(project_id, position, ${cols}, preview_asset_id)
       select project_id, position+1, ${cols}, preview_asset_id from scenes where id=$1 returning *`, [id]);
    await tx.query(`insert into shots(scene_id, position, description, camera, duration_sec)
       select $2, position, description, camera, duration_sec from shots where scene_id=$1`, [id, copy.id]);
    await touch(tx, src.project_id);
    await refreshProjectStatus(tx, src.project_id);
    return copy;
  });
}

export async function deleteScene(db: Db, id: string) {
  await db.transaction(async (tx) => {
    const [s] = await tx.query<Scene>(`delete from scenes where id=$1 returning *`, [id]);
    if (!s) return;
    await tx.query(`update scenes set position=position-1 where project_id=$1 and position>$2`, [s.project_id, s.position]);
    await touch(tx, s.project_id);
    await refreshProjectStatus(tx, s.project_id);
  });
}

/** Reorder by giving the full ordered list of scene ids. */
export async function reorderScenes(db: Db, projectId: string, orderedIds: string[]) {
  await db.transaction(async (tx) => {
    const current = await tx.query<{ id: string }>(`select id from scenes where project_id=$1`, [projectId]);
    const set = new Set(current.map((c) => c.id));
    if (orderedIds.length !== set.size || !orderedIds.every((i) => set.has(i))) throw new Error("ترتيب غير صالح");
    // Two passes avoid transient duplicate positions.
    for (let i = 0; i < orderedIds.length; i++) await tx.query(`update scenes set position=$2 where id=$1`, [orderedIds[i], -(i + 1)]);
    await tx.query(`update scenes set position=-position where project_id=$1`, [projectId]);
    await touch(tx, projectId);
  });
}

export async function moveScene(db: Db, id: string, direction: -1 | 1) {
  const scene = await getScene(db, id);
  if (!scene) return;
  const ids = (await listScenes(db, scene.project_id)).map((s) => s.id);
  const i = ids.indexOf(id);
  const j = i + direction;
  if (j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await reorderScenes(db, scene.project_id, ids);
}

export async function listShots(db: Db, sceneIds: string[]) {
  if (sceneIds.length === 0) return [];
  return db.query<{ id: string; scene_id: string; position: number; description: string; camera: string; duration_sec: number }>(
    `select * from shots where scene_id = any($1::uuid[]) order by scene_id, position`, [sceneIds]);
}
