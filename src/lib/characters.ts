import type { Db } from "@/db/client";
import { getAsset, type Asset } from "./assets";
import { ATTRIBUTE_FIELDS, VISUAL_KEYS, REFERENCE_ROLES, type AttributeKey, type ReferenceRole } from "@/config/character-fields";

export { ATTRIBUTE_FIELDS, REFERENCE_ROLES, type AttributeKey, type ReferenceRole };

/**
 * Character Library + Identity Lock. A character's profile, its reference images (by role),
 * its outfits and its voice profile form its identity pack, reused by every scene, answer and
 * talking clip. A locked character (or locked voice) cannot change until unlocked.
 */
export type CharacterAttributes = Partial<Record<AttributeKey, string>>;

export interface Character {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  attributes: CharacterAttributes;
  locked: boolean;
  voice_sample_asset_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface VoiceProfile {
  character_id: string;
  provider: string;
  voice_id: string;
  language: string;
  dialect: string;
  tone: string;
  speed: number;
  pitch: number;
  style: string;
  locked: boolean;
}

export interface Outfit {
  id: string;
  character_id: string;
  name: string;
  description: string;
  asset_id: string | null;
}

export interface KnowledgeEntry {
  id: string;
  character_id: string;
  project_id: string | null;
  title: string;
  content: string;
  updated_at: string;
}

const UUID = /^[0-9a-f-]{36}$/i;

function cleanAttributes(a: Record<string, unknown> | undefined): CharacterAttributes {
  const out: CharacterAttributes = {};
  for (const [k] of ATTRIBUTE_FIELDS) {
    const v = a?.[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 500);
  }
  return out;
}

async function requireUnlocked(db: Db, id: string): Promise<Character> {
  const c = await getCharacter(db, id);
  if (!c) throw new Error("الشخصية غير موجودة");
  if (c.locked) throw new Error("الشخصية مقفلة. ألغِ القفل أولًا لتعديلها");
  return c;
}

export async function listCharacters(db: Db, workspaceId: string) {
  return db.query<Character & { reference_count: number; cover_asset_id: string | null; knowledge_count: number }>(
    `select c.*,
       (select count(*)::int from character_references r where r.character_id=c.id) reference_count,
       (select r.asset_id from character_references r where r.character_id=c.id order by (r.role='primary') desc, r.created_at limit 1) cover_asset_id,
       (select count(*)::int from character_knowledge k where k.character_id=c.id) knowledge_count
     from characters c where workspace_id=$1 order by lower(name)`,
    [workspaceId],
  );
}

export async function getCharacter(db: Db, id: string): Promise<Character | null> {
  if (!UUID.test(id)) return null;
  const [c] = await db.query<Character>(`select * from characters where id=$1`, [id]);
  return c ?? null;
}

export async function createCharacter(db: Db, workspaceId: string, input: { name: string; description?: string; attributes?: Record<string, unknown> }) {
  const name = input.name.trim();
  if (!name) throw new Error("اكتب اسم الشخصية");
  if (name.length > 80) throw new Error("الاسم طويل جدًا");
  const [dup] = await db.query(`select 1 from characters where workspace_id=$1 and lower(name)=lower($2)`, [workspaceId, name]);
  if (dup) throw new Error("توجد شخصية بهذا الاسم");
  return db.transaction(async (tx) => {
    const [c] = await tx.query<Character>(
      `insert into characters(workspace_id, name, description, attributes) values ($1,$2,$3,$4) returning *`,
      [workspaceId, name, (input.description ?? "").trim(), JSON.stringify(cleanAttributes(input.attributes))],
    );
    await tx.query(`insert into character_voices(character_id) values ($1)`, [c.id]);
    return c;
  });
}

export async function updateCharacter(db: Db, id: string, patch: { name?: string; description?: string; attributes?: Record<string, unknown> }) {
  const c = await requireUnlocked(db, id);
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("اكتب اسم الشخصية");
    const [dup] = await db.query(`select 1 from characters where workspace_id=$1 and lower(name)=lower($2) and id<>$3`, [c.workspace_id, name, id]);
    if (dup) throw new Error("توجد شخصية بهذا الاسم");
    await db.query(`update characters set name=$2 where id=$1`, [id, name]);
  }
  if (patch.description !== undefined) await db.query(`update characters set description=$2 where id=$1`, [id, patch.description.trim()]);
  if (patch.attributes !== undefined) await db.query(`update characters set attributes=$2 where id=$1`, [id, JSON.stringify(cleanAttributes(patch.attributes))]);
  await db.query(`update characters set updated_at=now() where id=$1`, [id]);
}

export async function setCharacterLocked(db: Db, id: string, locked: boolean) {
  if (locked) {
    const [p] = await db.query(`select 1 from character_references where character_id=$1 and role='primary'`, [id]);
    const refs = await db.query(`select 1 from character_references where character_id=$1`, [id]);
    // Locking without any image is allowed (text-only identity), but if images exist one must be primary.
    if (refs.length && !p) throw new Error("اختر صورة رئيسية للشخصية قبل قفلها");
  }
  await db.query(`update characters set locked=$2, updated_at=now() where id=$1`, [id, locked]);
}

export async function deleteCharacter(db: Db, id: string) {
  await requireUnlocked(db, id);
  await db.query(`delete from characters where id=$1`, [id]);
}

// ---------- Reference images ----------
export async function listReferences(db: Db, characterId: string): Promise<(Asset & { role: ReferenceRole })[]> {
  return db.query<Asset & { role: ReferenceRole }>(
    `select a.*, r.role from character_references r join assets a on a.id=r.asset_id
     where r.character_id=$1 order by (r.role='primary') desc, r.created_at`, [characterId]);
}

export async function addReference(db: Db, characterId: string, assetId: string, role: ReferenceRole = "reference") {
  const c = await requireUnlocked(db, characterId);
  const a = await getAsset(db, assetId);
  if (!a) throw new Error("غير موجود");
  if (a.workspace_id !== c.workspace_id || a.kind !== "image") throw new Error("الصورة المرجعية يجب أن تكون صورة");
  if (!REFERENCE_ROLES.some(([r]) => r === role)) throw new Error("نوع مرجع غير صالح");
  const [hasPrimary] = await db.query(`select 1 from character_references where character_id=$1 and role='primary'`, [characterId]);
  // The first image becomes the primary identity image automatically.
  const finalRole = role === "primary" || !hasPrimary ? "primary" : role;
  await db.transaction(async (tx) => {
    if (finalRole === "primary") await tx.query(`update character_references set role='reference' where character_id=$1 and role='primary'`, [characterId]);
    await tx.query(
      `insert into character_references(character_id, asset_id, role) values ($1,$2,$3)
       on conflict (character_id, asset_id) do update set role=excluded.role`, [characterId, assetId, finalRole]);
  });
}

export async function setReferenceRole(db: Db, characterId: string, assetId: string, role: ReferenceRole) {
  await requireUnlocked(db, characterId);
  if (!REFERENCE_ROLES.some(([r]) => r === role)) throw new Error("نوع مرجع غير صالح");
  await db.transaction(async (tx) => {
    if (role === "primary") await tx.query(`update character_references set role='reference' where character_id=$1 and role='primary'`, [characterId]);
    await tx.query(`update character_references set role=$3 where character_id=$1 and asset_id=$2`, [characterId, assetId, role]);
  });
}

export async function removeReference(db: Db, characterId: string, assetId: string) {
  await requireUnlocked(db, characterId);
  await db.query(`delete from character_references where character_id=$1 and asset_id=$2`, [characterId, assetId]);
}

// ---------- Voice Identity Lock ----------
export async function getVoice(db: Db, characterId: string): Promise<VoiceProfile> {
  const [v] = await db.query<VoiceProfile>(`select * from character_voices where character_id=$1`, [characterId]);
  if (!v) {
    const [created] = await db.query<VoiceProfile>(`insert into character_voices(character_id) values ($1) returning *`, [characterId]);
    return { ...created, speed: Number(created.speed), pitch: Number(created.pitch) };
  }
  return { ...v, speed: Number(v.speed), pitch: Number(v.pitch) };
}

export async function updateVoice(db: Db, characterId: string, patch: Partial<Omit<VoiceProfile, "character_id" | "locked">>) {
  const v = await getVoice(db, characterId);
  if (v.locked) throw new Error("صوت الشخصية مقفل. ألغِ قفل الصوت أولًا لتغييره");
  const speed = patch.speed !== undefined ? Number(patch.speed) : v.speed;
  const pitch = patch.pitch !== undefined ? Number(patch.pitch) : v.pitch;
  if (!(speed >= 0.5 && speed <= 2)) throw new Error("السرعة بين 0.5 و2");
  if (!(pitch >= -12 && pitch <= 12)) throw new Error("طبقة الصوت بين -12 و12");
  const s = (k: "provider" | "voice_id" | "language" | "dialect" | "tone" | "style") => (patch[k] !== undefined ? String(patch[k]).trim().slice(0, 200) : v[k]);
  await db.query(
    `update character_voices set provider=$2, voice_id=$3, language=$4, dialect=$5, tone=$6, speed=$7, pitch=$8, style=$9, updated_at=now() where character_id=$1`,
    [characterId, s("provider") || "mock-voice", s("voice_id"), s("language") || "ar", s("dialect"), s("tone"), speed, pitch, s("style")]);
}

export async function setVoiceLocked(db: Db, characterId: string, locked: boolean) {
  await getVoice(db, characterId);
  await db.query(`update character_voices set locked=$2, updated_at=now() where character_id=$1`, [characterId, locked]);
}

// ---------- Outfits ----------
export async function listOutfits(db: Db, characterId: string): Promise<Outfit[]> {
  return db.query<Outfit>(`select * from character_outfits where character_id=$1 order by created_at`, [characterId]);
}

export async function createOutfit(db: Db, characterId: string, input: { name: string; description?: string; assetId?: string | null }) {
  const c = await getCharacter(db, characterId);
  if (!c) throw new Error("الشخصية غير موجودة");
  const name = input.name.trim();
  if (!name) throw new Error("اكتب اسم الزي");
  if (input.assetId) {
    const a = await getAsset(db, input.assetId);
    if (!a || a.kind !== "image" || a.workspace_id !== c.workspace_id) throw new Error("صورة الزي غير صالحة");
  }
  const [dup] = await db.query(`select 1 from character_outfits where character_id=$1 and name=$2`, [characterId, name]);
  if (dup) throw new Error("يوجد زي بهذا الاسم");
  const [o] = await db.query<Outfit>(
    `insert into character_outfits(character_id, name, description, asset_id) values ($1,$2,$3,$4) returning *`,
    [characterId, name, (input.description ?? "").trim(), input.assetId ?? null]);
  return o;
}

export async function deleteOutfit(db: Db, characterId: string, outfitId: string) {
  await db.query(`delete from character_outfits where id=$1 and character_id=$2`, [outfitId, characterId]);
}

// ---------- Knowledge base ----------
export async function listKnowledge(db: Db, characterId: string, projectId?: string | null): Promise<KnowledgeEntry[]> {
  return db.query<KnowledgeEntry>(
    `select * from character_knowledge where character_id=$1 and ($2::uuid is null or project_id is null or project_id=$2) order by created_at`,
    [characterId, projectId ?? null]);
}

export async function addKnowledge(db: Db, characterId: string, input: { title: string; content: string; projectId?: string | null }) {
  const c = await getCharacter(db, characterId);
  if (!c) throw new Error("الشخصية غير موجودة");
  const title = input.title.trim();
  const content = input.content.trim();
  if (!title || !content) throw new Error("اكتب العنوان والمحتوى");
  if (content.length > 20000) throw new Error("المحتوى طويل جدًا (الحد 20,000 حرف)");
  const [k] = await db.query<KnowledgeEntry>(
    `insert into character_knowledge(character_id, project_id, title, content) values ($1,$2,$3,$4) returning *`,
    [characterId, input.projectId ?? null, title, content]);
  return k;
}

export async function updateKnowledge(db: Db, characterId: string, id: string, patch: { title?: string; content?: string }) {
  if (patch.title !== undefined && !patch.title.trim()) throw new Error("اكتب العنوان");
  if (patch.content !== undefined && !patch.content.trim()) throw new Error("اكتب المحتوى");
  if (patch.title !== undefined) await db.query(`update character_knowledge set title=$2, updated_at=now() where id=$1 and character_id=$3`, [id, patch.title.trim(), characterId]);
  if (patch.content !== undefined) await db.query(`update character_knowledge set content=$2, updated_at=now() where id=$1 and character_id=$3`, [id, patch.content.trim(), characterId]);
}

export async function deleteKnowledge(db: Db, characterId: string, id: string) {
  await db.query(`delete from character_knowledge where id=$1 and character_id=$2`, [id, characterId]);
}

// ---------- Identity pack ----------
/** One-line visual identity used in every prompt that includes this character. */
export function characterDescriptor(c: Pick<Character, "name" | "description" | "attributes">): string {
  const parts = VISUAL_KEYS.map((k) => c.attributes[k]).filter(Boolean) as string[];
  if (c.description) parts.unshift(c.description);
  return parts.length ? `${c.name}: ${parts.join("، ")}` : c.name;
}

export interface IdentityPack {
  character: Character;
  descriptor: string;
  primaryAssetId: string | null;
  references: { assetId: string; role: ReferenceRole }[];
  voice: VoiceProfile;
}

export async function getIdentityPack(db: Db, characterId: string): Promise<IdentityPack> {
  const character = await getCharacter(db, characterId);
  if (!character) throw new Error("الشخصية غير موجودة");
  const refs = await listReferences(db, characterId);
  return {
    character,
    descriptor: characterDescriptor(character),
    primaryAssetId: refs.find((r) => r.role === "primary")?.id ?? null,
    references: refs.map((r) => ({ assetId: r.id, role: r.role })),
    voice: await getVoice(db, characterId),
  };
}
