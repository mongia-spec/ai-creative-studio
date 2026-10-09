import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { Db } from "@/db/client";
import { getAsset, normalizeMime, saveAsset, type Asset, type AudioRights } from "./assets";
import { getStorage } from "./storage";
import { hasFfmpeg, runFfmpeg, withTempDir } from "./ffmpeg";

/**
 * Real voice recordings and uploaded audio (MP3 / WAV / M4A, plus the browser's own WebM/Ogg recordings).
 * Everything here is local and free: FFmpeg checks the file, measures it and converts browser
 * recordings to M4A (AAC) so they also play on iPhone. Nothing is sent to an external service.
 */

export const AUDIO_ACCEPT = ".mp3,.wav,.m4a,.aac,.ogg,.webm,audio/*";
export const MAX_AUDIO_SEC = 600;
const BY_EXT: Record<string, string> = { mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/mp4", ogg: "audio/ogg", webm: "audio/webm" };
const PLAYABLE_EVERYWHERE = new Set(["audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4"]);

/** Some phones send an empty or generic type: fall back to the file extension. */
export function resolveAudioMime(type: string, name: string) {
  const t = normalizeMime(type || "");
  if (t.startsWith("audio/") && t !== "audio/octet-stream") return t;
  if (t === "video/webm" || t === "video/mp4") return t.replace("video/", "audio/");
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const m = BY_EXT[ext];
  if (!m) throw new Error("الملف ليس صوتًا مدعومًا. الصيغ المقبولة: MP3 وWAV وM4A.");
  return m;
}

function probeDuration(file: string): Promise<number | null> {
  return new Promise((resolve) => execFile(/*turbopackIgnore: true*/ process.env.FFPROBE_PATH || "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], { timeout: 30000 },
    (err, out) => { const d = Number(String(out).trim()); resolve(err || !Number.isFinite(d) ? null : d); }));
}

/** Validate the file decodes as audio, measure it, and make browser recordings playable everywhere. */
export async function prepareAudio(bytes: Uint8Array, mime: string): Promise<{ bytes: Uint8Array; mime: string; durationSec: number | null }> {
  if (!(await hasFfmpeg())) return { bytes, mime, durationSec: null };
  return withTempDir(async (dir) => {
    const ext = Object.entries(BY_EXT).find(([, m]) => m === mime)?.[0] ?? "bin";
    const src = path.join(dir, `in.${ext}`);
    await fs.writeFile(src, bytes);
    let out = { bytes, mime, file: src };
    if (!PLAYABLE_EVERYWHERE.has(mime)) {
      const m4a = path.join(dir, "out.m4a");
      try {
        await runFfmpeg(["-i", src, "-vn", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", m4a], 120000);
      } catch {
        throw new Error("تعذّرت قراءة الملف الصوتي. قد يكون تالفًا أو بصيغة غير مدعومة.");
      }
      out = { bytes: new Uint8Array(await fs.readFile(m4a)), mime: "audio/mp4", file: m4a };
    }
    const d = await probeDuration(out.file);
    if (d === null) throw new Error("تعذّرت قراءة الملف الصوتي. قد يكون تالفًا أو بصيغة غير مدعومة.");
    if (d > MAX_AUDIO_SEC) throw new Error("التسجيل أطول من 10 دقائق. قصّيه أو قسّميه إلى أجزاء.");
    return { bytes: out.bytes, mime: out.mime, durationSec: Math.round(d * 100) / 100 };
  });
}

export async function saveAudio(db: Db, input: {
  workspaceId: string; projectId?: string | null; name: string; type: string; bytes: Uint8Array;
  origin: AudioRights["origin"]; speaker: string; consent: boolean;
}): Promise<Asset> {
  if (!input.consent) throw new Error("أكّدي أن الصوت صوتك أو أن لديك إذن صاحبه قبل الحفظ.");
  const speaker = input.speaker.trim().slice(0, 80);
  if (!speaker) throw new Error("اكتبي اسم صاحب الصوت.");
  if (input.bytes.byteLength === 0) throw new Error("الملف فارغ.");
  const p = await prepareAudio(input.bytes, resolveAudioMime(input.type, input.name));
  const rights: AudioRights = { origin: input.origin, speaker, consent: true, confirmedAt: new Date().toISOString() };
  const name = input.name.trim().slice(0, 120) || (input.origin === "recording" ? "تسجيل" : "ملف صوتي");
  const a = await saveAsset(db, {
    workspaceId: input.workspaceId, projectId: input.projectId ?? null, source: "upload", name,
    mimeType: p.mime, bytes: p.bytes, durationSec: p.durationSec ?? undefined, rights,
  });
  // The same file uploaded again is stored once: refresh its label and rights record.
  const [row] = await db.query<Asset>(
    `update assets set name=$2, rights=$3, project_id=coalesce(project_id,$4), duration_sec=coalesce(duration_sec,$5) where id=$1 returning *`,
    [a.id, name, JSON.stringify(rights), input.projectId ?? null, p.durationSec],
  );
  return row;
}

export interface AudioItem extends Asset {
  scenes: { id: string; position: number; project_id: string }[];
  characters: { id: string; name: string }[];
  music_of: string[];
}

/** The audio library: the user's own recordings and uploads (generated voices are not listed). */
export async function listAudio(db: Db, workspaceId: string, projectId?: string | null): Promise<AudioItem[]> {
  const rows = await db.query<Asset>(
    `select * from assets where workspace_id=$1 and kind='audio' and source='upload'
       and ($2::uuid is null or project_id=$2 or project_id is null)
     order by created_at desc limit 200`, [workspaceId, projectId ?? null]);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [scenes, chars, music] = await Promise.all([
    db.query<{ id: string; position: number; project_id: string; audio_asset_id: string }>(
      `select id, position, project_id, audio_asset_id from scenes where audio_asset_id = any($1::uuid[]) order by position`, [ids]),
    db.query<{ id: string; name: string; voice_sample_asset_id: string }>(
      `select id, name, voice_sample_asset_id from characters where voice_sample_asset_id = any($1::uuid[])`, [ids]),
    db.query<{ id: string; music_asset_id: string }>(`select id, music_asset_id from projects where music_asset_id = any($1::uuid[])`, [ids]),
  ]);
  return rows.map((r) => ({
    ...r,
    scenes: scenes.filter((s) => s.audio_asset_id === r.id).map(({ id, position, project_id }) => ({ id, position, project_id })),
    characters: chars.filter((c) => c.voice_sample_asset_id === r.id).map(({ id, name }) => ({ id, name })),
    music_of: music.filter((m) => m.music_asset_id === r.id).map((m) => m.id),
  }));
}

async function requireAudio(db: Db, id: string, workspaceId: string) {
  const a = await getAsset(db, id);
  if (!a || a.kind !== "audio" || a.workspace_id !== workspaceId) throw new Error("الملف الصوتي غير موجود");
  return a;
}

export async function renameAudio(db: Db, workspaceId: string, id: string, name: string) {
  await requireAudio(db, id, workspaceId);
  const n = name.trim().slice(0, 120);
  if (!n) throw new Error("الاسم فارغ");
  await db.query(`update assets set name=$2 where id=$1`, [id, n]);
}

/**
 * Right to delete: removes the file and every link to it (scenes, music, character voice).
 * Clips already rendered from it (talking photo, exports) are separate files and are listed for the user.
 */
export async function deleteAudio(db: Db, workspaceId: string, id: string) {
  const a = await requireAudio(db, id, workspaceId);
  await db.transaction(async (tx) => {
    await tx.query(`update scenes set audio_asset_id=null, audio_offset_sec=0, audio_trim_start=0, audio_trim_end=null where audio_asset_id=$1`, [id]);
    await tx.query(`update projects set music_asset_id=null where music_asset_id=$1`, [id]);
    await tx.query(`update characters set voice_sample_asset_id=null where voice_sample_asset_id=$1`, [id]);
    await tx.query(`delete from assets where id=$1`, [id]);
  });
  await getStorage().remove(a.storage_key);
}

export async function setCharacterVoiceSample(db: Db, characterId: string, assetId: string | null) {
  const [c] = await db.query<{ workspace_id: string }>(`select workspace_id from characters where id=$1`, [characterId]);
  if (!c) throw new Error("الشخصية غير موجودة");
  if (assetId) await requireAudio(db, assetId, c.workspace_id);
  await db.query(`update characters set voice_sample_asset_id=$2, updated_at=now() where id=$1`, [characterId, assetId]);
}

/** Place and trim a scene's audio: start `offset` seconds into the scene, play [trimStart, trimEnd) of the file. */
export async function setSceneAudioEdit(db: Db, sceneId: string, edit: { offset: number; trimStart: number; trimEnd: number | null }) {
  const [s] = await db.query<{ duration_sec: string; audio_asset_id: string | null }>(`select duration_sec, audio_asset_id from scenes where id=$1`, [sceneId]);
  if (!s) throw new Error("المشهد غير موجود");
  if (!s.audio_asset_id) throw new Error("لا يوجد صوت في هذا المشهد");
  const a = await getAsset(db, s.audio_asset_id);
  const len = a?.duration_sec != null ? Number(a.duration_sec) : null;
  const { offset, trimStart } = edit;
  const trimEnd = edit.trimEnd === null || (len !== null && edit.trimEnd >= len) ? null : edit.trimEnd;
  if (![offset, trimStart].every((n) => Number.isFinite(n) && n >= 0)) throw new Error("القيم يجب أن تكون أرقامًا موجبة");
  if (offset >= Number(s.duration_sec)) throw new Error("بداية الصوت بعد نهاية المشهد");
  if (len !== null && trimStart >= len) throw new Error("بداية القص بعد نهاية التسجيل");
  if (trimEnd !== null && trimEnd <= trimStart) throw new Error("نهاية القص يجب أن تكون بعد بدايته");
  await db.query(`update scenes set audio_offset_sec=$2, audio_trim_start=$3, audio_trim_end=$4, updated_at=now() where id=$1`,
    [sceneId, offset, trimStart, trimEnd]);
}
