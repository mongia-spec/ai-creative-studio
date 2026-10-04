import type { Db } from "@/db/client";
import { enqueueJob, runJob, type Job } from "./jobs";
import { JOB } from "./job-handlers";
import { getAsset } from "./assets";
import { getCharacter, getIdentityPack, getVoice, type VoiceProfile } from "./characters";

/**
 * Voice and Talking Avatar, as jobs. Identical input (same text + same voice, or same image +
 * same audio) reuses the earlier result at no cost, so a repeated line or answer is never
 * generated twice.
 */
export interface VoiceSettings { provider: string; voiceId: string; language: string; dialect: string; tone: string; style: string; speed: number; pitch: number }

export const DEFAULT_VOICE: VoiceSettings = { provider: "mock-voice", voiceId: "", language: "ar", dialect: "", tone: "", style: "", speed: 1, pitch: 0 };

export function voiceSettings(v: VoiceProfile): VoiceSettings {
  return { provider: v.provider, voiceId: v.voice_id, language: v.language, dialect: v.dialect, tone: v.tone, style: v.style, speed: v.speed, pitch: v.pitch };
}

/** Apply the workspace pronunciation dictionary (whole words), keeping diacritics as typed. */
export async function applyPronunciation(db: Db, workspaceId: string, text: string, language = "ar") {
  const entries = await db.query<{ term: string; pronunciation: string }>(
    `select term, pronunciation from pronunciation_entries where workspace_id=$1 and language=$2 order by length(term) desc`, [workspaceId, language]);
  let out = text;
  for (const e of entries) {
    const esc = e.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(^|[\\s،.؟!:؛"'(])${esc}(?=$|[\\s،.؟!:؛"')])`, "g"), `$1${e.pronunciation}`);
  }
  return out;
}

async function finish(db: Db, job: Job) {
  const done = job.status === "succeeded" ? job : await runJob(db, job.id);
  if (done.status !== "succeeded") throw new Error(done.error ?? "تعذّر إكمال المهمة");
  return done;
}

export async function speak(db: Db, args: { workspaceId: string; projectId?: string | null; text: string; voice: VoiceSettings }) {
  const text = args.text.trim();
  if (!text) throw new Error("اكتب النص الذي ستقوله الشخصية");
  if (text.length > 2000) throw new Error("النص طويل جدًا (الحد 2000 حرف)");
  const spokenText = await applyPronunciation(db, args.workspaceId, text, args.voice.language);
  const { job, reused } = await enqueueJob(db, {
    workspaceId: args.workspaceId, projectId: args.projectId ?? null, type: JOB.VOICE,
    input: { spokenText, voice: args.voice },
  });
  const done = await finish(db, job);
  return { job: done, reused: reused && job.status === "succeeded", assetId: String(done.output!.assetId), output: done.output! };
}

export async function animate(db: Db, args: { workspaceId: string; projectId?: string | null; imageAssetId: string; audioAssetId: string }) {
  const image = await getAsset(db, args.imageAssetId);
  const audio = await getAsset(db, args.audioAssetId);
  if (!image || image.kind !== "image" || image.workspace_id !== args.workspaceId) throw new Error("اختاري صورة صالحة");
  if (!audio || audio.kind !== "audio" || audio.workspace_id !== args.workspaceId) throw new Error("الصوت غير صالح");
  const { job, reused } = await enqueueJob(db, {
    workspaceId: args.workspaceId, projectId: args.projectId ?? null, type: JOB.AVATAR,
    input: { imageAssetId: image.id, audioAssetId: audio.id },
  });
  const done = await finish(db, job);
  return { job: done, reused: reused && job.status === "succeeded", assetId: String(done.output!.assetId) };
}

/**
 * Talking Photo: image + (text → saved voice) or uploaded/recorded audio → talking clip.
 * With a character, its primary reference and locked voice are used; the face is not redrawn.
 */
export async function talkingPhoto(db: Db, args: {
  workspaceId: string; characterId?: string | null; imageAssetId?: string | null; text?: string; audioAssetId?: string | null; voice?: VoiceSettings;
}) {
  let imageAssetId = args.imageAssetId ?? null;
  let voice = args.voice ?? DEFAULT_VOICE;
  if (args.characterId) {
    const c = await getCharacter(db, args.characterId);
    if (!c || c.workspace_id !== args.workspaceId) throw new Error("الشخصية غير موجودة");
    const pack = await getIdentityPack(db, c.id);
    imageAssetId ??= pack.primaryAssetId;
    voice = voiceSettings(await getVoice(db, c.id));
  }
  if (!imageAssetId) throw new Error("اختاري صورة أو شخصية لها صورة رئيسية");
  let audioAssetId = args.audioAssetId ?? null;
  let voiceOut: Record<string, unknown> | null = null;
  if (!audioAssetId) {
    const s = await speak(db, { workspaceId: args.workspaceId, text: args.text ?? "", voice });
    audioAssetId = s.assetId;
    voiceOut = s.output;
  }
  const v = await animate(db, { workspaceId: args.workspaceId, imageAssetId, audioAssetId });
  return { videoAssetId: v.assetId, audioAssetId, imageAssetId, voice, voiceOut, reused: v.reused };
}
