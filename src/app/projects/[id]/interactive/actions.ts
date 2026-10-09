"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import * as ix from "@/lib/interactive";
import type { ActionResult } from "@/app/actions";

async function guard(projectId: string, fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn();
    revalidatePath(`/projects/${projectId}/interactive`);
    revalidatePath(`/play/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "حدث خطأ غير متوقع" };
  }
}

export async function saveSettingsAction(projectId: string, s: ix.InteractiveSettings) {
  return guard(projectId, async () => ix.saveSettings(await getDb(), projectId, s));
}

export async function addInteractionAction(projectId: string, sceneId: string, input: { kind: ix.Interaction["kind"]; atSec: number; prompt: string; choices: ix.Choice[] }) {
  return guard(projectId, async () => ix.addInteraction(await getDb(), sceneId, input));
}

export async function deleteInteractionAction(projectId: string, id: string) {
  return guard(projectId, async () => ix.deleteInteraction(await getDb(), projectId, id));
}

export async function respondAction(interactionId: string, choiceIndex: number) {
  try {
    return { ok: true as const, ...(await ix.respond(await getDb(), interactionId, choiceIndex)) };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "حدث خطأ غير متوقع" };
  }
}
