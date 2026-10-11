import type { Db } from "@/db/client";
import type { Tier } from "./conversation";
import { saveAsset } from "./assets";
import { prepareAudio, probeDuration, resolveAudioMime } from "./audio";
import { addKnowledge } from "./characters";
import { createProject } from "./projects";
import { withTempDir } from "./ffmpeg";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Interactive video: creator controls, timed questions, hotspots and branches, viewer answers.
 * Everything runs in the player over existing scenes; nothing is regenerated.
 */
export interface InteractiveSettings {
  /** Characters viewers may ask; empty = every character in the cast. */
  askable: string[];
  allowAsk: boolean;
  allowMic: boolean;
  /** Most expensive answer tier viewers may request (cost control). */
  maxTier: Tier;
}
export const DEFAULT_SETTINGS: InteractiveSettings = { askable: [], allowAsk: true, allowMic: true, maxTier: "avatar" };
const TIERS: Tier[] = ["text", "voice", "avatar"];

export function readSettings(raw: unknown): InteractiveSettings {
  const r = (raw ?? {}) as Partial<InteractiveSettings>;
  return {
    askable: Array.isArray(r.askable) ? r.askable.filter((x) => typeof x === "string") : [],
    allowAsk: r.allowAsk !== false,
    allowMic: r.allowMic !== false,
    maxTier: TIERS.includes(r.maxTier as Tier) ? (r.maxTier as Tier) : "avatar",
  };
}

export async function getSettings(db: Db, projectId: string) {
  const [p] = await db.query<{ interactive: unknown }>(`select interactive from projects where id=$1`, [projectId]);
  if (!p) throw new Error("المشروع غير موجود");
  return readSettings(p.interactive);
}

export async function saveSettings(db: Db, projectId: string, s: InteractiveSettings) {
  await db.query(`update projects set interactive=$2, updated_at=now() where id=$1`, [projectId, JSON.stringify(readSettings(s))]);
}

/** The tier actually used: the viewer's choice, capped by the creator's maximum. */
export function capTier(requested: Tier, max: Tier): Tier {
  return TIERS.indexOf(requested) > TIERS.indexOf(max) ? max : requested;
}

export interface Choice { label: string; correct?: boolean; gotoPosition?: number | null; feedback?: string; x?: number; y?: number }
export interface Interaction { id: string; project_id: string; scene_id: string; at_sec: number; kind: Kind; prompt: string; choices: Choice[]; prompt_audio_asset_id: string | null }
/** "voice": an open question the viewer answers by recording; it is kept for the teacher, not graded. */
export type Kind = "question" | "hotspot" | "branch" | "voice";
const KINDS: Kind[] = ["question", "hotspot", "branch", "voice"];

function cleanChoices(kind: Interaction["kind"], choices: Choice[]): Choice[] {
  if (kind === "voice") {
    // Optional model answer, revealed after the student records.
    const model = String(choices[0]?.feedback ?? "").trim().slice(0, 300);
    return model ? [{ label: "إجابة نموذجية", feedback: model }] : [];
  }
  const out = choices.map((c) => ({
    label: String(c.label ?? "").trim().slice(0, 120),
    correct: kind === "question" ? !!c.correct : undefined,
    gotoPosition: c.gotoPosition ? Number(c.gotoPosition) : null,
    feedback: String(c.feedback ?? "").trim().slice(0, 300),
    x: kind === "hotspot" ? Math.min(95, Math.max(5, Number(c.x ?? 50))) : undefined,
    y: kind === "hotspot" ? Math.min(95, Math.max(5, Number(c.y ?? 50))) : undefined,
  })).filter((c) => c.label);
  if (kind === "hotspot" && out.length !== 1) throw new Error("النقطة التفاعلية لها عنصر واحد: عنوان ومعلومة");
  if (kind !== "hotspot" && out.length < 2) throw new Error("أضيفي خيارين على الأقل");
  if (kind === "question" && !out.some((c) => c.correct)) throw new Error("حدّدي الإجابة الصحيحة");
  if (kind === "branch" && out.some((c) => !c.gotoPosition)) throw new Error("كل خيار في التفرّع يحتاج رقم مشهد ينتقل إليه");
  return out;
}

export async function listInteractions(db: Db, projectId: string): Promise<Interaction[]> {
  const rows = await db.query<Interaction>(
    `select i.* from interactions i join scenes s on s.id=i.scene_id where i.project_id=$1 order by s.position, i.at_sec`, [projectId]);
  return rows.map((r) => ({ ...r, at_sec: Number(r.at_sec) }));
}

export async function addInteraction(db: Db, sceneId: string, input: { kind: Interaction["kind"]; atSec: number; prompt: string; choices: Choice[]; promptAudioAssetId?: string | null }) {
  const [scene] = await db.query<{ project_id: string; duration_sec: string; n: number }>(
    `select s.project_id, s.duration_sec, (select count(*)::int from scenes x where x.project_id=s.project_id) n from scenes s where s.id=$1`, [sceneId]);
  if (!scene) throw new Error("المشهد غير موجود");
  if (!KINDS.includes(input.kind)) throw new Error("نوع غير معروف");
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error("اكتبي نص السؤال أو العنوان");
  const at = Number(input.atSec);
  if (!(at >= 0 && at <= Number(scene.duration_sec))) throw new Error(`الوقت يجب أن يكون داخل مدة المشهد (0 إلى ${Number(scene.duration_sec)} ث)`);
  const choices = cleanChoices(input.kind, input.choices);
  if (choices.some((c) => c.gotoPosition && (c.gotoPosition < 1 || c.gotoPosition > scene.n))) throw new Error(`رقم المشهد بين 1 و${scene.n}`);
  const [row] = await db.query<Interaction>(
    `insert into interactions(project_id, scene_id, at_sec, kind, prompt, choices, prompt_audio_asset_id) values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [scene.project_id, sceneId, at, input.kind, prompt.slice(0, 300), JSON.stringify(choices), input.promptAudioAssetId || null]);
  return row;
}

export async function deleteInteraction(db: Db, projectId: string, id: string) {
  await db.query(`delete from interactions where id=$1 and project_id=$2`, [id, projectId]);
}

/** Records a viewer's choice and returns what the player should do next. */
export async function respond(db: Db, interactionId: string, choiceIndex: number) {
  const [i] = await db.query<Interaction>(`select * from interactions where id=$1`, [interactionId]);
  if (!i) throw new Error("السؤال غير موجود");
  if (i.kind === "voice") throw new Error("هذا السؤال يُجاب بالتسجيل الصوتي");
  const c = i.choices[choiceIndex];
  if (!c) throw new Error("خيار غير صالح");
  const correct = i.kind === "question" ? !!c.correct : null;
  await db.query(`insert into interaction_responses(interaction_id, choice_index, correct) values ($1,$2,$3)`, [i.id, choiceIndex, correct]);
  return { correct, feedback: c.feedback || (correct === true ? "أحسنت! إجابة صحيحة." : correct === false ? "حاول مرة أخرى، أنت قريب." : ""), gotoPosition: c.gotoPosition ?? null };
}

export async function interactionStats(db: Db, projectId: string) {
  return db.query<{ interaction_id: string; answers: number; correct: number }>(
    `select r.interaction_id, count(*)::int answers, count(*) filter (where r.correct)::int correct
     from interaction_responses r join interactions i on i.id=r.interaction_id where i.project_id=$1 group by r.interaction_id`, [projectId]);
}

/**
 * A spoken answer to a "voice" question. The recording is stored (browser WebM/Ogg become M4A)
 * and listed for the teacher. Nothing grades it automatically: no speech service is called.
 */
export async function respondVoice(db: Db, interactionId: string, input: { bytes: Uint8Array; type: string; student?: string }) {
  const [i] = await db.query<Interaction & { workspace_id: string }>(
    `select i.*, p.workspace_id from interactions i join projects p on p.id=i.project_id where i.id=$1`, [interactionId]);
  if (!i || i.kind !== "voice") throw new Error("السؤال غير موجود");
  if (!input.bytes.byteLength) throw new Error("التسجيل فارغ");
  if (input.bytes.byteLength > 10 * 1024 * 1024) throw new Error("التسجيل طويل جدًا");
  const audio = await prepareAudio(input.bytes, resolveAudioMime(input.type, "answer.webm"));
  if (audio.durationSec !== null && audio.durationSec > 180) throw new Error("الإجابة أطول من 3 دقائق");
  const student = (input.student ?? "").trim().slice(0, 60);
  const a = await saveAsset(db, {
    workspaceId: i.workspace_id, projectId: i.project_id, source: "upload", name: `إجابة${student ? ` ${student}` : ""}: ${i.prompt.slice(0, 40)}`,
    mimeType: audio.mime, bytes: audio.bytes, durationSec: audio.durationSec ?? undefined,
    rights: { origin: "recording", speaker: student || "طالب", consent: true, confirmedAt: new Date().toISOString() },
  });
  await db.query(`insert into interaction_responses(interaction_id, choice_index, correct, audio_asset_id) values ($1,0,null,$2)`, [i.id, a.id]);
  return { feedback: "أحسنت! وصلت إجابتك، وستستمع إليها معلمتك.", modelAnswer: i.choices[0]?.feedback || null, assetId: a.id };
}

export async function listVoiceAnswers(db: Db, projectId: string) {
  return db.query<{ id: string; interaction_id: string; audio_asset_id: string; name: string; duration_sec: string | null; created_at: string }>(
    `select r.id, r.interaction_id, r.audio_asset_id, a.name, a.duration_sec, r.created_at from interaction_responses r
     join interactions i on i.id=r.interaction_id join assets a on a.id=r.audio_asset_id
     where i.project_id=$1 order by r.created_at desc`, [projectId]);
}

/**
 * Interactive lesson from a finished video (MP4/WebM/MOV): one project, one scene covering the
 * whole video, so questions are placed by their second in the video. The character answers
 * viewers' questions from the story text saved as its knowledge for this project.
 */
export async function createVideoLesson(db: Db, input: {
  workspaceId: string; title: string; bytes: Uint8Array; mimeType: string; characterId?: string | null; storyText?: string;
}) {
  if (!input.mimeType.startsWith("video/")) throw new Error("اختاري ملف فيديو (MP4)");
  const duration = await withTempDir(async (dir) => {
    const f = path.join(dir, "in.mp4");
    await fs.writeFile(f, input.bytes);
    return probeDuration(f);
  });
  if (!duration || duration < 1) throw new Error("تعذّرت قراءة الفيديو. جرّبي ملف MP4.");
  const title = input.title.trim() || "درس تفاعلي";
  const story = (input.storyText ?? "").trim();
  const p = await createProject(db, {
    workspaceId: input.workspaceId, title, startType: "text", inputText: story || title, platformPreset: "youtube-video",
    targetDurationSec: Math.min(1800, Math.max(5, Math.round(duration))),
  });
  const v = await saveAsset(db, { workspaceId: input.workspaceId, projectId: p.id, source: "upload", name: title, mimeType: input.mimeType, bytes: input.bytes, durationSec: duration });
  await db.query(`update projects set source_video_asset_id=$2 where id=$1`, [p.id, v.id]);
  const [scene] = await db.query<{ id: string }>(
    `insert into scenes(project_id, position, title, description, narration, duration_sec, video_asset_id, video_start, visual_source)
     values ($1,1,$2,$2,$3,$4,$5,0,'clip') returning id`, [p.id, title, story.slice(0, 2000), duration, v.id]);
  if (input.characterId) {
    await db.query(`insert into scene_characters(scene_id, character_id) values ($1,$2) on conflict do nothing`, [scene.id, input.characterId]);
    if (story) await addKnowledge(db, input.characterId, { title: `قصة: ${title}`, content: story, projectId: p.id });
  }
  return { projectId: p.id, sceneId: scene.id, durationSec: duration, videoAssetId: v.id };
}
