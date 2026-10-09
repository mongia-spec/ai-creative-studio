import type { Db } from "@/db/client";

/** Workspace pronunciation dictionary: applied to every line before it is voiced. */
export async function listPronunciations(db: Db, workspaceId: string) {
  return db.query<{ id: string; term: string; pronunciation: string; language: string }>(
    `select id, term, pronunciation, language from pronunciation_entries where workspace_id=$1 order by term`, [workspaceId]);
}

export async function addPronunciation(db: Db, workspaceId: string, term: string, pronunciation: string, language = "ar") {
  const t = term.trim(), p = pronunciation.trim();
  if (!t || !p) throw new Error("اكتبي الكلمة وطريقة نطقها");
  if (t.length > 80 || p.length > 160) throw new Error("النص طويل جدًا");
  await db.query(
    `insert into pronunciation_entries(workspace_id, term, pronunciation, language) values ($1,$2,$3,$4)
     on conflict (workspace_id, term, language) do update set pronunciation=excluded.pronunciation`, [workspaceId, t, p, language]);
}

export async function deletePronunciation(db: Db, workspaceId: string, id: string) {
  await db.query(`delete from pronunciation_entries where id=$1 and workspace_id=$2`, [id, workspaceId]);
}
