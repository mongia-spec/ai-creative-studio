import type { Db } from "@/db/client";
import type { Tier } from "./conversation";

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
export interface Interaction { id: string; project_id: string; scene_id: string; at_sec: number; kind: "question" | "hotspot" | "branch"; prompt: string; choices: Choice[] }

function cleanChoices(kind: Interaction["kind"], choices: Choice[]): Choice[] {
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

export async function addInteraction(db: Db, sceneId: string, input: { kind: Interaction["kind"]; atSec: number; prompt: string; choices: Choice[] }) {
  const [scene] = await db.query<{ project_id: string; duration_sec: string; n: number }>(
    `select s.project_id, s.duration_sec, (select count(*)::int from scenes x where x.project_id=s.project_id) n from scenes s where s.id=$1`, [sceneId]);
  if (!scene) throw new Error("المشهد غير موجود");
  if (!["question", "hotspot", "branch"].includes(input.kind)) throw new Error("نوع غير معروف");
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error("اكتبي نص السؤال أو العنوان");
  const at = Number(input.atSec);
  if (!(at >= 0 && at <= Number(scene.duration_sec))) throw new Error(`الوقت يجب أن يكون داخل مدة المشهد (0 إلى ${Number(scene.duration_sec)} ث)`);
  const choices = cleanChoices(input.kind, input.choices);
  if (choices.some((c) => c.gotoPosition && (c.gotoPosition < 1 || c.gotoPosition > scene.n))) throw new Error(`رقم المشهد بين 1 و${scene.n}`);
  const [row] = await db.query<Interaction>(
    `insert into interactions(project_id, scene_id, at_sec, kind, prompt, choices) values ($1,$2,$3,$4,$5,$6) returning *`,
    [scene.project_id, sceneId, at, input.kind, prompt.slice(0, 300), JSON.stringify(choices)]);
  return row;
}

export async function deleteInteraction(db: Db, projectId: string, id: string) {
  await db.query(`delete from interactions where id=$1 and project_id=$2`, [id, projectId]);
}

/** Records a viewer's choice and returns what the player should do next. */
export async function respond(db: Db, interactionId: string, choiceIndex: number) {
  const [i] = await db.query<Interaction>(`select * from interactions where id=$1`, [interactionId]);
  if (!i) throw new Error("السؤال غير موجود");
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
