import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { freshEnv } from "./helpers";
import { addPronunciation, deletePronunciation, listPronunciations } from "@/lib/pronunciation";
import { applyPronunciation } from "@/lib/talking";
import { workspaceUsage } from "@/lib/usage";
import { createProject } from "@/lib/projects";
import { generateScript } from "@/lib/studio";
import { getPlan, PLANS } from "@/config/plans";

let db: Db, ws: string;
beforeEach(async () => { ({ db, workspaceId: ws } = await freshEnv()); });

describe("pronunciation dictionary", () => {
  it("adds, updates, applies and deletes entries", async () => {
    await addPronunciation(db, ws, "مسقط", "مَسْقَط");
    await addPronunciation(db, ws, "مسقط", "مَسْقَطْ");
    const list = await listPronunciations(db, ws);
    expect(list).toHaveLength(1);
    expect(await applyPronunciation(db, ws, "زرت مسقط أمس")).toBe("زرت مَسْقَطْ أمس");
    await expect(addPronunciation(db, ws, "", "x")).rejects.toThrow();
    await deletePronunciation(db, ws, list[0].id);
    expect(await listPronunciations(db, ws)).toHaveLength(0);
  });
});

describe("usage and plans", () => {
  it("summarizes this month's provider calls at zero cost", async () => {
    const p = await createProject(db, { workspaceId: ws, startType: "idea", platformPreset: "square", inputText: "فكرة عن البحر" });
    await generateScript(db, p.id);
    const u = await workspaceUsage(db, ws);
    expect(u.plan.id).toBe("free");
    expect(u.totalCostUsd).toBe(0);
    expect(u.byCapability.find((r) => r.capability === "text")?.calls).toBe(1);
    expect(u.byCapability.find((r) => r.capability === "image")!.mock).toBeGreaterThan(0);
    expect(u.counts.projects).toBe(1);
    expect(getPlan("nope").id).toBe("free");
    expect(PLANS.every((pl) => pl.monthlyCredits > 0)).toBe(true);
  });
});
