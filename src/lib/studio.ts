import type { Db } from "@/db/client";
import "./job-handlers";
import { JOB } from "./job-handlers";
import { enqueueJob, runJob, type Job } from "./jobs";
import { getProject, saveVersion } from "./projects";
import { getScene, listScenes, type Scene } from "./scenes";
import { autoLinkCharacters, getProjectMemory } from "./scene-memory";
import { composeScenePrompt } from "./prompt";

/**
 * High-level studio actions used by the UI. Jobs are queued and, since Phase 1 providers are
 * instant mocks, run right away; the same jobs can be run by the background worker instead.
 */
export async function generateScript(db: Db, projectId: string): Promise<Job> {
  const project = await getProject(db, projectId);
  if (!project) throw new Error("المشروع غير موجود");
  const { job } = await enqueueJob(db, {
    workspaceId: project.workspace_id, projectId, type: JOB.SCRIPT,
    // An explicit user click always creates a new job (it replaces the current scenes).
    input: { input: project.input_text, style: project.style, preset: project.platform_preset, duration: project.target_duration_sec, startType: project.start_type, requestedAt: Date.now() },
  });
  const done = await runJob(db, job.id);
  if (done.status === "succeeded") {
    await autoLinkCharacters(db, projectId);
    await saveVersion(db, projectId, "توليد النص والمشاهد");
    for (const s of await listScenes(db, projectId)) await generatePreview(db, s.id, false);
  }
  return done;
}

export async function generatePreview(db: Db, sceneId: string, regenerate = true): Promise<Job> {
  const scene = await getScene(db, sceneId);
  if (!scene) throw new Error("المشهد غير موجود");
  const project = (await getProject(db, scene.project_id))!;
  const { job } = await enqueueJob(db, {
    workspaceId: project.workspace_id, projectId: project.id, type: JOB.PREVIEW,
    // The composed prompt (scene + locked character identities + continuity) is part of the job
    // input, so changing a character or its state produces a new preview; nothing else does.
    input: { sceneId, ...(await sceneIdentityInput(db, scene)), title: scene.title, position: scene.position, variant: regenerate ? Date.now() : 0 },
  });
  if (job.status === "succeeded" && job.output?.assetId) {
    // Same input already generated: reuse the existing preview at no cost.
    await db.query(`update scenes set preview_asset_id=$2 where id=$1`, [sceneId, job.output.assetId]);
    return job;
  }
  return runJob(db, job.id);
}

export async function scenePrompt(db: Db, scene: Scene) {
  const memory = await getProjectMemory(db, scene.project_id);
  return composeScenePrompt(scene, memory[scene.id] ?? []);
}

/**
 * Everything that defines how a scene must look: the composed prompt and the identity
 * reference images (primary/face/outfit/pose of each character + its current outfit image).
 * It is part of the preview job input, so the same identity always reuses the same result.
 */
export async function sceneIdentityInput(db: Db, scene: Scene) {
  const memory = await getProjectMemory(db, scene.project_id);
  const cast = memory[scene.id] ?? [];
  const refs: string[] = [];
  for (const c of cast) {
    const rows = await db.query<{ asset_id: string }>(
      `select asset_id from character_references where character_id=$1 order by (role='primary') desc, created_at`, [c.characterId]);
    refs.push(...rows.map((r) => r.asset_id));
    if (c.effectiveOutfit?.assetId) refs.push(c.effectiveOutfit.assetId);
  }
  return { prompt: composeScenePrompt(scene, cast), referenceAssetIds: [...new Set(refs)] };
}
