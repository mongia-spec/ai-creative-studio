"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { getDefaultWorkspaceId } from "@/lib/workspace";
import { archiveProject, createProject, getProject, updateProject, updateScript } from "@/lib/projects";
import { generatePreview, generateScript } from "@/lib/studio";
import * as scenes from "@/lib/scenes";
import { retryJob, runJob } from "@/lib/jobs";
import { saveAsset } from "@/lib/assets";
import { setCharacterState, setSceneCharacters , setSceneOutfit, lockOutfitForScenes } from "@/lib/scene-memory";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function guard(fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "حدث خطأ غير متوقع" };
  }
}

function refresh(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/");
}

export async function createProjectAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  let id = "";
  const res = await guard(async () => {
    const db = await getDb();
    const p = await createProject(db, {
      workspaceId: await getDefaultWorkspaceId(db),
      title: String(form.get("title") ?? ""),
      startType: String(form.get("startType") ?? ""),
      inputText: String(form.get("inputText") ?? ""),
      platformPreset: String(form.get("platformPreset") ?? ""),
      targetDurationSec: Number(form.get("targetDurationSec")),
      style: String(form.get("style") ?? "cinematic"),
    });
    id = p.id;
    const job = await generateScript(db, p.id);
    if (job.status !== "succeeded") throw new Error(`تعذّر توليد النص: ${job.error ?? ""}`);
  });
  if (!res.ok && !id) return res;
  revalidatePath("/");
  redirect(`/projects/${id}`);
}

export async function regenerateScriptAction(projectId: string, inputText: string) {
  return guard(async () => {
    const db = await getDb();
    await updateProject(db, projectId, { input_text: inputText });
    const job = await generateScript(db, projectId);
    if (job.status !== "succeeded") throw new Error(job.error ?? "فشل التوليد");
    refresh(projectId);
  });
}

export async function saveScriptAction(projectId: string, patch: { title?: string; logline?: string; body?: string }) {
  return guard(async () => {
    await updateScript(await getDb(), projectId, patch);
    refresh(projectId);
  });
}

export async function archiveProjectAction(projectId: string) {
  await archiveProject(await getDb(), projectId);
  revalidatePath("/");
  redirect("/");
}

async function projectOfScene(sceneId: string) {
  const s = await scenes.getScene(await getDb(), sceneId);
  if (!s) throw new Error("المشهد غير موجود");
  return s.project_id;
}

export async function updateSceneAction(sceneId: string, patch: Partial<Record<scenes.SceneEditable, string | number>>) {
  return guard(async () => {
    const pid = await projectOfScene(sceneId);
    await scenes.updateScene(await getDb(), sceneId, patch);
    refresh(pid);
  });
}

export async function setSceneStatusAction(sceneId: string, status: "draft" | "approved" | "rejected") {
  return guard(async () => {
    const pid = await projectOfScene(sceneId);
    await scenes.setSceneStatus(await getDb(), sceneId, status);
    refresh(pid);
  });
}

export async function approveAllAction(projectId: string) {
  return guard(async () => {
    await scenes.approveAll(await getDb(), projectId);
    refresh(projectId);
  });
}

export async function duplicateSceneAction(sceneId: string) {
  return guard(async () => {
    const pid = await projectOfScene(sceneId);
    await scenes.duplicateScene(await getDb(), sceneId);
    refresh(pid);
  });
}

export async function deleteSceneAction(sceneId: string) {
  return guard(async () => {
    const pid = await projectOfScene(sceneId);
    await scenes.deleteScene(await getDb(), sceneId);
    refresh(pid);
  });
}

export async function moveSceneAction(sceneId: string, direction: -1 | 1) {
  return guard(async () => {
    const pid = await projectOfScene(sceneId);
    await scenes.moveScene(await getDb(), sceneId, direction);
    refresh(pid);
  });
}

export async function addSceneAction(projectId: string, afterPosition?: number) {
  return guard(async () => {
    await scenes.addScene(await getDb(), projectId, afterPosition);
    refresh(projectId);
  });
}

export async function regeneratePreviewAction(sceneId: string) {
  return guard(async () => {
    const pid = await projectOfScene(sceneId);
    const job = await generatePreview(await getDb(), sceneId, true);
    if (job.status === "failed") throw new Error(job.error ?? "فشل توليد المعاينة");
    refresh(pid);
  });
}

export async function retryJobAction(projectId: string, jobId: string) {
  return guard(async () => {
    const db = await getDb();
    if (await retryJob(db, jobId)) await runJob(db, jobId);
    refresh(projectId);
  });
}

export async function uploadAssetAction(projectId: string, form: FormData) {
  return guard(async () => {
    const db = await getDb();
    const project = await getProject(db, projectId);
    if (!project) throw new Error("المشروع غير موجود");
    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) throw new Error("اختر ملفًا أولًا");
    for (const f of files) {
      await saveAsset(db, {
        workspaceId: project.workspace_id, projectId, source: "upload", name: f.name,
        mimeType: f.type, bytes: new Uint8Array(await f.arrayBuffer()),
      });
    }
    refresh(projectId);
  });
}

async function projectOfShot(shotId: string) {
  const [r] = await (await getDb()).query<{ project_id: string }>(
    `select s.project_id from shots sh join scenes s on s.id=sh.scene_id where sh.id=$1`, [shotId]);
  if (!r) throw new Error("اللقطة غير موجودة");
  return r.project_id;
}

export async function addShotAction(sceneId: string) {
  return guard(async () => {
    const pid = await projectOfScene(sceneId);
    await scenes.addShot(await getDb(), sceneId);
    refresh(pid);
  });
}

export async function updateShotAction(shotId: string, patch: { description?: string; camera?: string; duration_sec?: number }) {
  return guard(async () => {
    const pid = await projectOfShot(shotId);
    await scenes.updateShot(await getDb(), shotId, patch);
    refresh(pid);
  });
}

export async function deleteShotAction(shotId: string) {
  return guard(async () => {
    const pid = await projectOfShot(shotId);
    await scenes.deleteShot(await getDb(), shotId);
    refresh(pid);
  });
}

export async function setSceneCharactersAction(sceneId: string, characterIds: string[]) {
  return guard(async () => {
    const pid = await projectOfScene(sceneId);
    await setSceneCharacters(await getDb(), sceneId, characterIds);
    refresh(pid);
  });
}

export async function setCharacterStateAction(sceneId: string, characterId: string, state: Record<string, string>) {
  return guard(async () => {
    const pid = await projectOfScene(sceneId);
    await setCharacterState(await getDb(), sceneId, characterId, state);
    refresh(pid);
  });
}

export async function setSceneOutfitAction(sceneId: string, characterId: string, outfitId: string | null) {
  return guard(async () => {
    const pid = await projectOfScene(sceneId);
    await setSceneOutfit(await getDb(), sceneId, characterId, outfitId);
    refresh(pid);
  });
}

export async function lockOutfitForScenesAction(projectId: string, characterId: string, outfitId: string, fromPos: number, toPos: number) {
  return guard(async () => {
    const n = await lockOutfitForScenes(await getDb(), projectId, characterId, outfitId, fromPos, toPos);
    if (n === 0) throw new Error("الشخصية لا تظهر في أي مشهد ضمن هذا النطاق");
    refresh(projectId);
  });
}

export async function exportDraftAction(projectId: string, options: import("@/lib/export").ExportOptions): Promise<ActionResult> {
  return guard(async () => {
    const { exportDraftVideo } = await import("@/lib/studio");
    await exportDraftVideo(await getDb(), projectId, options);
    refresh(projectId);
  });
}

// ---------- Production ----------
async function uploadOne(projectId: string, form: FormData, key: string, kind: "image" | "audio") {
  const db = await getDb();
  const project = await getProject(db, projectId);
  if (!project) throw new Error("المشروع غير موجود");
  const f = form.get(key);
  if (!(f instanceof File) || f.size === 0) throw new Error("اختاري ملفًا أولًا");
  if (!f.type.startsWith(kind + "/")) throw new Error(kind === "image" ? "الملف ليس صورة" : "الملف ليس صوتًا");
  return (await saveAsset(db, { workspaceId: project.workspace_id, projectId, source: "upload", name: f.name, mimeType: f.type, bytes: new Uint8Array(await f.arrayBuffer()) })).id;
}

export async function setSceneMediaAction(sceneId: string, field: "reference_asset_id" | "audio_asset_id", form: FormData | null) {
  return guard(async () => {
    const pid = await projectOfScene(sceneId);
    const { setSceneMedia } = await import("@/lib/production");
    const id = form ? await uploadOne(pid, form, "file", field === "audio_asset_id" ? "audio" : "image") : null;
    await setSceneMedia(await getDb(), sceneId, field, id);
    refresh(pid);
  });
}

export async function setMusicAction(projectId: string, form: FormData | null, volume?: number) {
  return guard(async () => {
    const { setProjectMusic } = await import("@/lib/production");
    const db = await getDb();
    const current = (await getProject(db, projectId))?.music_asset_id ?? null;
    const id = form ? await uploadOne(projectId, form, "file", "audio") : volume !== undefined ? current : null;
    await setProjectMusic(db, projectId, id, volume);
    refresh(projectId);
  });
}

export async function autoDirectAction(projectId: string) {
  return guard(async () => {
    const { autoDirect } = await import("@/lib/production");
    await autoDirect(await getDb(), projectId);
    refresh(projectId);
  });
}

export async function socialCopyAction(projectId: string, kind: "hook" | "cta"): Promise<{ ok: true; lines: string[]; mock: boolean } | { ok: false; error: string }> {
  try {
    const { socialCopy } = await import("@/lib/social");
    return { ok: true, ...(await socialCopy(await getDb(), projectId, kind)) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "حدث خطأ غير متوقع" };
  }
}

export async function saveBrandKitAction(form: FormData): Promise<ActionResult> {
  return guard(async () => {
    const db = await getDb();
    const ws = await getDefaultWorkspaceId(db);
    const { getBrandKit, saveBrandKit } = await import("@/lib/production");
    let logo = (await getBrandKit(db, ws)).logo_asset_id;
    const f = form.get("logo");
    if (f instanceof File && f.size > 0) {
      if (!f.type.startsWith("image/")) throw new Error("الشعار يجب أن يكون صورة");
      logo = (await saveAsset(db, { workspaceId: ws, source: "upload", name: f.name, mimeType: f.type, bytes: new Uint8Array(await f.arrayBuffer()) })).id;
    }
    if (form.get("removeLogo") === "1") logo = null;
    const g = (k: string) => String(form.get(k) ?? "");
    await saveBrandKit(db, ws, { name: g("name"), primary_color: g("primary_color"), text_color: g("text_color"), watermark: g("watermark"), cta: g("cta"), logo_asset_id: logo });
    revalidatePath("/brand");
    revalidatePath("/projects/[id]", "page");
  });
}

export async function exportMultiAction(projectId: string, presetIds: string[], base: import("@/lib/export").ExportOptions): Promise<ActionResult> {
  return guard(async () => {
    if (!presetIds.length) throw new Error("اختاري منصة واحدة على الأقل");
    const { exportDraftVideo } = await import("@/lib/studio");
    const db = await getDb();
    // One after another: each platform is its own cached job, so a failure doesn't lose the others.
    for (const presetId of presetIds) await exportDraftVideo(db, projectId, { ...base, presetId });
    refresh(projectId);
    revalidatePath(`/projects/${projectId}/social`);
  });
}
