"use server";

import { getDb } from "@/db/client";
import { askCharacter, type AskResult, type Channel, type Tier } from "@/lib/conversation";

export type AskResponse = ({ ok: true } & AskResult) | { ok: false; error: string };

export async function askCharacterAction(args: {
  characterId: string; question: string; tier: Tier; channel: Channel; conversationId: string | null; projectId: string | null;
}): Promise<AskResponse> {
  try {
    if (!["text", "voice", "avatar"].includes(args.tier)) throw new Error("مستوى غير معروف");
    const r = await askCharacter(await getDb(), { ...args, channel: args.channel === "player" ? "player" : "test" });
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "حدث خطأ غير متوقع" };
  }
}

export async function testVoiceAction(characterId: string, text: string): Promise<{ ok: true; audioAssetId: string; reused: boolean } | { ok: false; error: string }> {
  try {
    const { getVoice, getCharacter } = await import("@/lib/characters");
    const { speak, voiceSettings } = await import("@/lib/talking");
    const db = await getDb();
    const c = await getCharacter(db, characterId);
    if (!c) throw new Error("الشخصية غير موجودة");
    const s = await speak(db, { workspaceId: c.workspace_id, text, voice: voiceSettings(await getVoice(db, characterId)) });
    return { ok: true, audioAssetId: s.assetId, reused: s.reused };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "حدث خطأ غير متوقع" };
  }
}
