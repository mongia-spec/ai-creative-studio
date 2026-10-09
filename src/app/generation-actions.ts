"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { approvePlan, buildPlan, runPlan, type Plan, type Quality, type RunReport } from "@/lib/generation";

const msg = (e: unknown) => (e instanceof Error ? e.message : "حدث خطأ غير متوقع");

export async function planAction(projectId: string, quality: Quality): Promise<{ ok: true; plan: Plan } | { ok: false; error: string }> {
  try { return { ok: true, plan: await buildPlan(await getDb(), projectId, quality) }; } catch (e) { return { ok: false, error: msg(e) }; }
}

/** Approve this exact plan with a cap, then generate. A free (mock) plan needs no cap. */
export async function approveAndRunAction(projectId: string, hash: string, capUsd: number, quality: Quality): Promise<{ ok: true; report: RunReport } | { ok: false; error: string }> {
  try {
    const db = await getDb();
    await approvePlan(db, projectId, hash, capUsd, quality);
    const report = await runPlan(db, projectId);
    revalidatePath(`/projects/${projectId}`, "layout");
    return { ok: true, report };
  } catch (e) { return { ok: false, error: msg(e) }; }
}
