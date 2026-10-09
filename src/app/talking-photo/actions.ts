"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { getDefaultWorkspaceId } from "@/lib/workspace";
import { saveAsset } from "@/lib/assets";
import { DEFAULT_VOICE, talkingPhoto } from "@/lib/talking";

export type TalkResult =
  | { ok: true; videoAssetId: string; audioAssetId: string; reused: boolean; dialectNote: string | null }
  | { ok: false; error: string };

export async function talkingPhotoAction(form: FormData): Promise<TalkResult> {
  try {
    const db = await getDb();
    const ws = await getDefaultWorkspaceId(db);
    const file = (k: string) => { const f = form.get(k); return f instanceof File && f.size > 0 ? f : null; };
    const characterId = String(form.get("characterId") ?? "") || null;
    let imageAssetId: string | null = null;
    const img = file("image");
    if (!characterId) {
      if (!img) throw new Error("اختاري شخصية أو ارفعي صورة");
      if (!img.type.startsWith("image/")) throw new Error("الملف المرفوع ليس صورة");
      imageAssetId = (await saveAsset(db, { workspaceId: ws, source: "upload", name: img.name, mimeType: img.type, bytes: new Uint8Array(await img.arrayBuffer()) })).id;
    }
    // Real recordings come from the audio library (saved there with the speaker's rights confirmation).
    let audioAssetId: string | null = null;
    if (form.get("mode") === "audio") {
      audioAssetId = String(form.get("audioAssetId") ?? "") || null;
      if (!audioAssetId) throw new Error("اختاري تسجيلًا من مكتبة الصوت، أو سجّلي صوتك أولًا");
      const [a] = await db.query(`select 1 from assets where id=$1 and workspace_id=$2 and kind='audio'`, [audioAssetId, ws]);
      if (!a) throw new Error("التسجيل غير موجود");
    }
    const r = await talkingPhoto(db, {
      workspaceId: ws, characterId, imageAssetId, audioAssetId, text: String(form.get("text") ?? ""),
      voice: { ...DEFAULT_VOICE, dialect: String(form.get("dialect") ?? ""), speed: Number(form.get("speed") ?? 1) || 1 },
    });
    revalidatePath("/talking-photo");
    const dialectNote = !audioAssetId && r.voice.dialect && !r.voiceOut?.dialectUsed
      ? "المزوّد الحالي لا يدعم هذه اللهجة، فلم يُطلب نطقها بها." : null;
    return { ok: true, videoAssetId: r.videoAssetId, audioAssetId: r.audioAssetId, reused: r.reused, dialectNote };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "حدث خطأ غير متوقع" };
  }
}

/** Step "Preview": voice the text first (cached), so the talking clip later reuses this audio. */
export async function previewVoiceAction(form: FormData): Promise<{ ok: true; audioAssetId: string } | { ok: false; error: string }> {
  try {
    const db = await getDb();
    const ws = await getDefaultWorkspaceId(db);
    const characterId = String(form.get("characterId") ?? "") || null;
    let voice = { ...DEFAULT_VOICE, dialect: String(form.get("dialect") ?? ""), speed: Number(form.get("speed") ?? 1) || 1 };
    if (characterId) {
      const { getVoice } = await import("@/lib/characters");
      const { voiceSettings } = await import("@/lib/talking");
      voice = voiceSettings(await getVoice(db, characterId));
    }
    const { speak } = await import("@/lib/talking");
    const s = await speak(db, { workspaceId: ws, text: String(form.get("text") ?? ""), voice });
    return { ok: true, audioAssetId: s.assetId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "حدث خطأ غير متوقع" };
  }
}
