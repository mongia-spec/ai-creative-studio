"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { getDefaultWorkspaceId } from "@/lib/workspace";
import { addPronunciation, deletePronunciation } from "@/lib/pronunciation";
import { applyPronunciation } from "@/lib/talking";
import type { ActionResult } from "../actions";

export async function addPronunciationAction(term: string, pronunciation: string): Promise<ActionResult> {
  try {
    const db = await getDb();
    await addPronunciation(db, await getDefaultWorkspaceId(db), term, pronunciation);
    revalidatePath("/pronunciation");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "حدث خطأ" };
  }
}

export async function deletePronunciationAction(id: string): Promise<ActionResult> {
  const db = await getDb();
  await deletePronunciation(db, await getDefaultWorkspaceId(db), id);
  revalidatePath("/pronunciation");
  return { ok: true };
}

export async function previewPronunciationAction(text: string) {
  const db = await getDb();
  return applyPronunciation(db, await getDefaultWorkspaceId(db), text);
}
