"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { getDefaultWorkspaceId } from "@/lib/workspace";
import { analyzeStory, createStoryProject, setSceneVisual, type StoryAnalysis } from "@/lib/audio-story";

const msg = (e: unknown) => (e instanceof Error ? e.message : "حدث خطأ غير متوقع");

export async function analyzeStoryAction(audioAssetId: string, transcript: string, characters: string[] = []): Promise<{ ok: true; analysis: StoryAnalysis } | { ok: false; error: string }> {
  try {
    const db = await getDb();
    return { ok: true, analysis: await analyzeStory(db, { workspaceId: await getDefaultWorkspaceId(db), audioAssetId, transcript, extraCharacters: characters }) };
  } catch (e) { return { ok: false, error: msg(e) }; }
}

/** Re-analyses on the server (never trusts a client copy), then builds the project, shots and timing. */
export async function createStoryProjectAction(input: { audioAssetId: string; transcript: string; title: string; platformPreset: string; characters: string[]; kind: string; style: string; quality: "draft" | "standard" }): Promise<{ ok: true; projectId: string } | { ok: false; error: string }> {
  try {
    const db = await getDb();
    const ws = await getDefaultWorkspaceId(db);
    const analysis = await analyzeStory(db, { workspaceId: ws, audioAssetId: input.audioAssetId, transcript: input.transcript, extraCharacters: input.characters });
    const projectId = await createStoryProject(db, { workspaceId: ws, analysis, title: input.title, platformPreset: input.platformPreset, kind: input.kind, style: input.style, quality: input.quality });
    revalidatePath("/");
    return { ok: true, projectId };
  } catch (e) { return { ok: false, error: msg(e) }; }
}

export async function setSceneVisualAction(sceneId: string, assetId: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await setSceneVisual(await getDb(), sceneId, assetId);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) { return { ok: false, error: msg(e) }; }
}
