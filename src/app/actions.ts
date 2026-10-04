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
