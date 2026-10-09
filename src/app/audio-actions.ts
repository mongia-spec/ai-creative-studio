"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { getDefaultWorkspaceId } from "@/lib/workspace";
import { deleteAudio, listAudio, renameAudio, saveAudio, setCharacterVoiceSample, setSceneAudioEdit, type AudioItem } from "@/lib/audio";

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };
async function guard<T extends object>(fn: () => Promise<T>): Promise<R<T>> {
  try {
    const out = await fn();
    revalidatePath("/", "layout");
    return { ok: true, ...out };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "حدث خطأ غير متوقع" };
  }
}

export type SavedAudio = { id: string; name: string; durationSec: number | null };

/** Save a recording or an uploaded file to the library, optionally linking it to a scene or a character. */
export async function saveAudioAction(fd: FormData): Promise<R<{ audio: SavedAudio }>> {
  return guard(async () => {
    const db = await getDb();
    const ws = await getDefaultWorkspaceId(db);
    const f = fd.get("file");
    if (!(f instanceof File) || f.size === 0) throw new Error("سجّلي صوتًا أو اختاري ملفًا أولًا");
    const projectId = String(fd.get("projectId") ?? "") || null;
    if (projectId) {
      const [p] = await db.query(`select 1 from projects where id=$1 and workspace_id=$2`, [projectId, ws]);
      if (!p) throw new Error("المشروع غير موجود");
    }
    const a = await saveAudio(db, {
      workspaceId: ws, projectId, name: String(fd.get("name") ?? "") || f.name, type: f.type,
      bytes: new Uint8Array(await f.arrayBuffer()),
      origin: fd.get("origin") === "recording" ? "recording" : "upload",
      speaker: String(fd.get("speaker") ?? ""), consent: fd.get("consent") === "on",
    });
    const sceneId = String(fd.get("sceneId") ?? "");
    if (sceneId) {
      const { setSceneMedia } = await import("@/lib/production");
      await setSceneMedia(db, sceneId, "audio_asset_id", a.id);
    }
    const characterId = String(fd.get("characterId") ?? "");
    if (characterId) await setCharacterVoiceSample(db, characterId, a.id);
    return { audio: { id: a.id, name: a.name ?? "", durationSec: a.duration_sec == null ? null : Number(a.duration_sec) } };
  });
}

export async function listAudioAction(projectId?: string | null): Promise<AudioItem[]> {
  const db = await getDb();
  return listAudio(db, await getDefaultWorkspaceId(db), projectId ?? null);
}

export async function renameAudioAction(id: string, name: string) {
  return guard(async () => { const db = await getDb(); await renameAudio(db, await getDefaultWorkspaceId(db), id, name); return {}; });
}

export async function deleteAudioAction(id: string) {
  return guard(async () => { const db = await getDb(); await deleteAudio(db, await getDefaultWorkspaceId(db), id); return {}; });
}

export async function linkSceneAudioAction(sceneId: string, assetId: string | null) {
  return guard(async () => {
    const { setSceneMedia } = await import("@/lib/production");
    await setSceneMedia(await getDb(), sceneId, "audio_asset_id", assetId);
    return {};
  });
}

export async function linkCharacterAudioAction(characterId: string, assetId: string | null) {
  return guard(async () => { await setCharacterVoiceSample(await getDb(), characterId, assetId); return {}; });
}

export async function sceneAudioEditAction(sceneId: string, edit: { offset: number; trimStart: number; trimEnd: number | null }) {
  return guard(async () => { await setSceneAudioEdit(await getDb(), sceneId, edit); return {}; });
}
