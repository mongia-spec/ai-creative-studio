import type { Db } from "@/db/client";
import { getPreset } from "@/config/platform-presets";
import { START_OPTIONS } from "@/config/start-options";
import type { Scene } from "./scenes";

export interface Project {
  id: string;
  workspace_id: string;
  title: string;
  start_type: string;
  input_text: string;
  language: string;
  platform_preset: string;
  target_duration_sec: number;
  style: string;
  status: "draft" | "script_ready" | "storyboard_ready" | "approved" | "archived";
  created_at: string;
  updated_at: string;
}

export interface Script {
  id: string;
  project_id: string;
  title: string;
  logline: string;
  body: string;
  status: "draft" | "approved";
}

export interface CreateProjectInput {
  workspaceId: string;
  title?: string;
  startType: string;
  inputText: string;
  platformPreset: string;
  targetDurationSec?: number;
  style?: string;
  language?: string;
}

export async function createProject(db: Db, input: CreateProjectInput): Promise<Project> {
  const opt = START_OPTIONS.find((o) => o.id === input.startType);
  if (!opt || opt.status !== "WORKING") throw new Error("نقطة البداية هذه غير متاحة بعد");
  const text = input.inputText.trim();
  if (text.length < 3) throw new Error("اكتب فكرة أو نصًا أولًا");
  if (text.length > 50000) throw new Error("النص طويل جدًا (الحد 50,000 حرف)");
  const preset = getPreset(input.platformPreset);
  const duration = Math.round(input.targetDurationSec ?? preset.defaultDurationSec);
  if (!(duration >= 5 && duration <= preset.maxDurationSec)) {
    throw new Error(`المدة يجب أن تكون بين 5 و${preset.maxDurationSec} ثانية لهذه المنصة`);
  }
  const title = input.title?.trim() || text.split(/\s+/).slice(0, 6).join(" ");
  const [p] = await db.query<Project>(
    `insert into projects(workspace_id, title, start_type, input_text, language, platform_preset, target_duration_sec, style)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
    [input.workspaceId, title, input.startType, text, input.language ?? "ar", preset.id, duration, input.style ?? "cinematic"],
  );
  return p;
}

export async function listProjects(db: Db, workspaceId: string) {
  return db.query<Project & { scene_count: number }>(
    `select p.*, (select count(*)::int from scenes s where s.project_id=p.id) scene_count
     from projects p where workspace_id=$1 and status <> 'archived' order by updated_at desc`,
    [workspaceId],
  );
}

export async function getProject(db: Db, id: string): Promise<Project | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [p] = await db.query<Project>(`select * from projects where id=$1`, [id]);
  return p ?? null;
}

export async function getScript(db: Db, projectId: string): Promise<Script | null> {
  const [s] = await db.query<Script>(`select * from scripts where project_id=$1`, [projectId]);
  return s ?? null;
}

export async function updateProject(db: Db, id: string, patch: Partial<Pick<Project, "title" | "input_text" | "style">>) {
  const allowed = ["title", "input_text", "style"] as const;
  for (const k of allowed) {
    if (patch[k] !== undefined) await db.query(`update projects set ${k}=$2, updated_at=now() where id=$1`, [id, String(patch[k])]);
  }
}

export async function updateScript(db: Db, projectId: string, patch: Partial<Pick<Script, "title" | "logline" | "body" | "status">>) {
  const allowed = ["title", "logline", "body", "status"] as const;
  for (const k of allowed) {
    if (patch[k] !== undefined) await db.query(`update scripts set ${k}=$2, updated_at=now() where project_id=$1`, [projectId, String(patch[k])]);
  }
  await db.query(`update projects set updated_at=now() where id=$1`, [projectId]);
}

export async function archiveProject(db: Db, id: string) {
  await db.query(`update projects set status='archived', updated_at=now() where id=$1`, [id]);
}

/** Snapshot the project (script + scenes) as a new version. */
export async function saveVersion(db: Db, projectId: string, note: string) {
  const script = await getScript(db, projectId);
  const scenes = await db.query<Scene>(`select * from scenes where project_id=$1 order by position`, [projectId]);
  const [{ v }] = await db.query<{ v: number }>(`select coalesce(max(version),0)+1 v from project_versions where project_id=$1`, [projectId]);
  await db.query(`insert into project_versions(project_id, version, note, snapshot) values ($1,$2,$3,$4)`,
    [projectId, v, note, JSON.stringify({ script, scenes })]);
  return v;
}

export async function listVersions(db: Db, projectId: string) {
  return db.query<{ version: number; note: string; created_at: string }>(
    `select version, note, created_at from project_versions where project_id=$1 order by version desc`, [projectId]);
}
