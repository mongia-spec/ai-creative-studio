"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { getDefaultWorkspaceId } from "@/lib/workspace";
import * as chars from "@/lib/characters";
import { saveAsset } from "@/lib/assets";
import type { ActionResult } from "../actions";

async function guard(fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "حدث خطأ غير متوقع" };
  }
}

function refresh(id?: string) {
  revalidatePath("/characters");
  if (id) revalidatePath(`/characters/${id}`);
  // Character changes affect prompts and memory shown on project pages.
  revalidatePath("/projects/[id]", "page");
}

export async function createCharacterAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  let id = "";
  const res = await guard(async () => {
    const db = await getDb();
    const c = await chars.createCharacter(db, await getDefaultWorkspaceId(db), {
      name: String(form.get("name") ?? ""), description: String(form.get("description") ?? ""),
    });
    id = c.id;
  });
  if (!res.ok) return res;
  refresh();
  redirect(`/characters/${id}`);
}

export async function updateCharacterAction(id: string, patch: { name: string; description: string; attributes: Record<string, string> }) {
  return guard(async () => {
    await chars.updateCharacter(await getDb(), id, patch);
    refresh(id);
  });
}

export async function setLockedAction(id: string, locked: boolean) {
  return guard(async () => {
    await chars.setCharacterLocked(await getDb(), id, locked);
    refresh(id);
  });
}

export async function deleteCharacterAction(id: string): Promise<ActionResult> {
  const res = await guard(async () => chars.deleteCharacter(await getDb(), id));
  if (!res.ok) return res;
  refresh();
  redirect("/characters");
}

export async function uploadReferencesAction(id: string, form: FormData) {
  return guard(async () => {
    const db = await getDb();
    const c = await chars.getCharacter(db, id);
    if (!c) throw new Error("الشخصية غير موجودة");
    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) throw new Error("اختر صورة أولًا");
    for (const f of files) {
      if (!f.type.startsWith("image/")) throw new Error(`«${f.name}» ليست صورة`);
      const a = await saveAsset(db, { workspaceId: c.workspace_id, source: "upload", name: f.name, mimeType: f.type, bytes: new Uint8Array(await f.arrayBuffer()) });
      await chars.addReference(db, id, a.id);
    }
    refresh(id);
  });
}

export async function removeReferenceAction(id: string, assetId: string) {
  return guard(async () => {
    await chars.removeReference(await getDb(), id, assetId);
    refresh(id);
  });
}
