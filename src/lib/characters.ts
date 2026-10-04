import type { Db } from "@/db/client";
import { getAsset, type Asset } from "./assets";

/**
 * Character Library. A character's attributes plus its reference images form its
 * "Character Reference Pack". A locked character can't be edited, so every scene uses
 * exactly the same description (Character Lock).
 */
export const ATTRIBUTE_FIELDS = [
  ["ageRange", "الفئة العمرية"],
  ["face", "ملامح الوجه"],
  ["hair", "الشعر"],
  ["skinTone", "لون البشرة"],
  ["body", "البنية"],
  ["clothing", "الملابس الأساسية"],
  ["accessories", "الإكسسوارات"],
  ["visualStyle", "الأسلوب البصري"],
  ["personality", "الشخصية"],
  ["voice", "الصوت"],
  ["language", "اللغة"],
  ["dialect", "اللهجة"],
] as const;
export type AttributeKey = (typeof ATTRIBUTE_FIELDS)[number][0];
export type CharacterAttributes = Partial<Record<AttributeKey, string>>;

/** Attributes that describe how the character looks (used in image prompts). */
const VISUAL_KEYS: AttributeKey[] = ["ageRange", "face", "hair", "skinTone", "body", "clothing", "accessories", "visualStyle"];

export interface Character {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  attributes: CharacterAttributes;
  locked: boolean;
  created_at: string;
  updated_at: string;
}

function cleanAttributes(a: Record<string, unknown> | undefined): CharacterAttributes {
  const out: CharacterAttributes = {};
  for (const [k] of ATTRIBUTE_FIELDS) {
    const v = a?.[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 500);
  }
  return out;
}

export async function listCharacters(db: Db, workspaceId: string) {
  return db.query<Character & { reference_count: number; cover_asset_id: string | null }>(
    `select c.*,
       (select count(*)::int from character_references r where r.character_id=c.id) reference_count,
       (select r.asset_id from character_references r where r.character_id=c.id order by r.created_at limit 1) cover_asset_id
     from characters c where workspace_id=$1 order by lower(name)`,
    [workspaceId],
  );
}

export async function getCharacter(db: Db, id: string): Promise<Character | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [c] = await db.query<Character>(`select * from characters where id=$1`, [id]);
  return c ?? null;
}

export async function createCharacter(db: Db, workspaceId: string, input: { name: string; description?: string; attributes?: Record<string, unknown> }) {
  const name = input.name.trim();
  if (!name) throw new Error("اكتب اسم الشخصية");
  if (name.length > 80) throw new Error("الاسم طويل جدًا");
  const [dup] = await db.query(`select 1 from characters where workspace_id=$1 and lower(name)=lower($2)`, [workspaceId, name]);
  if (dup) throw new Error("توجد شخصية بهذا الاسم");
  const [c] = await db.query<Character>(
    `insert into characters(workspace_id, name, description, attributes) values ($1,$2,$3,$4) returning *`,
    [workspaceId, name, (input.description ?? "").trim(), JSON.stringify(cleanAttributes(input.attributes))],
  );
  return c;
}

export async function updateCharacter(db: Db, id: string, patch: { name?: string; description?: string; attributes?: Record<string, unknown> }) {
  const c = await getCharacter(db, id);
  if (!c) throw new Error("الشخصية غير موجودة");
  if (c.locked) throw new Error("الشخصية مقفلة. ألغِ القفل أولًا لتعديلها");
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
  await db.query(`update characters set locked=$2, updated_at=now() where id=$1`, [id, locked]);
}

export async function deleteCharacter(db: Db, id: string) {
  const c = await getCharacter(db, id);
  if (c?.locked) throw new Error("الشخصية مقفلة. ألغِ القفل أولًا لحذفها");
  await db.query(`delete from characters where id=$1`, [id]);
}

export async function listReferences(db: Db, characterId: string): Promise<Asset[]> {
  return db.query<Asset>(
    `select a.* from character_references r join assets a on a.id=r.asset_id where r.character_id=$1 order by r.created_at`, [characterId]);
}

export async function addReference(db: Db, characterId: string, assetId: string) {
  const c = await getCharacter(db, characterId);
  const a = await getAsset(db, assetId);
  if (!c || !a) throw new Error("غير موجود");
  if (c.locked) throw new Error("الشخصية مقفلة. ألغِ القفل أولًا لتعديل صورها");
  if (a.workspace_id !== c.workspace_id || a.kind !== "image") throw new Error("الصورة المرجعية يجب أن تكون صورة");
  await db.query(`insert into character_references(character_id, asset_id) values ($1,$2) on conflict do nothing`, [characterId, assetId]);
}

export async function removeReference(db: Db, characterId: string, assetId: string) {
  const c = await getCharacter(db, characterId);
  if (c?.locked) throw new Error("الشخصية مقفلة. ألغِ القفل أولًا لتعديل صورها");
  await db.query(`delete from character_references where character_id=$1 and asset_id=$2`, [characterId, assetId]);
}

/** One-line visual identity used in every prompt that includes this character. */
export function characterDescriptor(c: Pick<Character, "name" | "description" | "attributes">): string {
  const parts = VISUAL_KEYS.map((k) => c.attributes[k]).filter(Boolean) as string[];
  if (c.description) parts.unshift(c.description);
  return parts.length ? `${c.name}: ${parts.join("، ")}` : c.name;
}
