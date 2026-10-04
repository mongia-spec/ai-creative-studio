import { registerJobHandler } from "./jobs";
import { getProvider } from "@/providers/registry";
import { getPreset } from "@/config/platform-presets";
import { recordProviderCall } from "./cost";
import { saveAsset } from "./assets";
import type { Project } from "./projects";
import type { Scene } from "./scenes";

/** Job types. Each one calls exactly one provider through the router and logs its cost. */
export const JOB = { SCRIPT: "script.generate", PREVIEW: "scene.preview" } as const;

registerJobHandler(JOB.SCRIPT, "text", async ({ db, job, setProvider }) => {
  const projectId = job.project_id!;
  const [project] = await db.query<Project>(`select * from projects where id=$1`, [projectId]);
  if (!project) throw new Error("المشروع غير موجود");
  const provider = getProvider("text", job.quality_tier);
  setProvider(provider.info.id);
  const preset = getPreset(project.platform_preset);
  const { result, usage } = await provider.generateScript({
    startType: project.start_type as "idea" | "text",
    input: String(job.input.input),
    language: project.language,
    style: project.style,
    targetDurationSec: project.target_duration_sec,
    aspectRatio: preset.aspectRatio,
  });
  await recordProviderCall(db, { workspaceId: job.workspace_id, projectId, jobId: job.id, provider: provider.info, usage });

  const sceneIds = await db.transaction(async (tx) => {
    await tx.query(
      `insert into scripts(project_id, title, logline, body, source_job_id) values ($1,$2,$3,$4,$5)
       on conflict (project_id) do update set title=excluded.title, logline=excluded.logline, body=excluded.body,
         status='draft', source_job_id=excluded.source_job_id, updated_at=now()`,
      [projectId, result.title, result.logline, result.body, job.id]);
    await tx.query(`delete from scenes where project_id=$1`, [projectId]);
    const ids: string[] = [];
    for (const [i, s] of result.scenes.entries()) {
      const [row] = await tx.query<{ id: string }>(
        `insert into scenes(project_id, position, title, description, location, characters_text, narration, dialogue,
           camera, lighting, mood, duration_sec, visual_prompt, audio_notes)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
        [projectId, i + 1, s.title, s.description, s.location, s.characters, s.narration, s.dialogue,
         s.camera, s.lighting, s.mood, s.durationSec, s.visualPrompt, s.audioNotes]);
      for (const [k, shot] of s.shots.entries()) {
        await tx.query(`insert into shots(scene_id, position, description, camera, duration_sec) values ($1,$2,$3,$4,$5)`,
          [row.id, k + 1, shot.description, shot.camera, shot.durationSec]);
      }
      ids.push(row.id);
    }
    await tx.query(`update projects set status='storyboard_ready', updated_at=now() where id=$1`, [projectId]);
    return ids;
  });
  return { sceneIds, sceneCount: sceneIds.length };
});

registerJobHandler(JOB.PREVIEW, "image", async ({ db, job, setProvider }) => {
  const sceneId = String(job.input.sceneId);
  const [scene] = await db.query<Scene & { platform_preset: string; style: string }>(
    `select s.*, p.platform_preset, p.style from scenes s join projects p on p.id=s.project_id where s.id=$1`, [sceneId]);
  if (!scene) throw new Error("المشهد غير موجود");
  const preset = getPreset(scene.platform_preset);
  // Storyboard previews are low-res drafts: a fraction of the final size.
  const scale = 0.3;
  const provider = getProvider("image", "draft");
  setProvider(provider.info.id);
  const { result, usage } = await provider.generateImage({
    prompt: String(job.input.prompt), style: scene.style, label: `مشهد ${scene.position}: ${scene.title}`,
    width: Math.round(preset.width * scale), height: Math.round(preset.height * scale),
    seed: `${sceneId}:${job.input.variant ?? 0}`,
    // Identity references come from the job input (see sceneIdentityInput).
    referenceAssetIds: (job.input.referenceAssetIds as string[] | undefined) ?? [],
  });
  await recordProviderCall(db, { workspaceId: job.workspace_id, projectId: scene.project_id, jobId: job.id, provider: provider.info, usage });
  const asset = await saveAsset(db, {
    workspaceId: job.workspace_id, projectId: scene.project_id, source: "generated", name: `preview-${scene.position}`,
    mimeType: result.mimeType, bytes: result.bytes, width: result.width, height: result.height,
    providerRef: { provider: provider.info.id, jobId: job.id },
  });
  await db.query(`update scenes set preview_asset_id=$2, updated_at=now() where id=$1`, [sceneId, asset.id]);
  return { assetId: asset.id };
});
