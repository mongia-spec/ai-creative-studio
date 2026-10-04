import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { freshEnv } from "./helpers";
import { createProject, getScript, listVersions, getProject, updateScript } from "@/lib/projects";
import { generatePreview, generateScript } from "@/lib/studio";
import { addScene, approveAll, deleteScene, duplicateScene, listScenes, listShots, moveScene, reorderScenes, setSceneStatus, updateScene } from "@/lib/scenes";
import { estimateFromScenes, spendSummary } from "@/lib/cost";
import { enqueueJob, processQueue, registerJobHandler, retryJob, runJob, getJob } from "@/lib/jobs";
import { getAsset, readAssetBytes, saveAsset } from "@/lib/assets";

let db: Db;
let ws: string;
beforeEach(async () => {
  ({ db, workspaceId: ws } = await freshEnv());
});

async function newProject(startType = "idea", inputText = "طفل يكتشف مدينة قديمة") {
  return createProject(db, { workspaceId: ws, startType, inputText, platformPreset: "instagram-reel", targetDurationSec: 30 });
}

describe("projects", () => {
  it("validates input and refuses features that are not built yet", async () => {
    await expect(createProject(db, { workspaceId: ws, startType: "image", inputText: "x x x", platformPreset: "square" })).rejects.toThrow();
    await expect(createProject(db, { workspaceId: ws, startType: "idea", inputText: " ", platformPreset: "square" })).rejects.toThrow();
    await expect(createProject(db, { workspaceId: ws, startType: "idea", inputText: "فكرة جيدة", platformPreset: "youtube-short", targetDurationSec: 500 })).rejects.toThrow();
    const p = await newProject();
    expect(p.title).toBe("طفل يكتشف مدينة قديمة");
    expect(p.status).toBe("draft");
    expect(p.target_duration_sec).toBe(30);
  });
});

describe("MVP flow: idea → script → scenes → storyboard", () => {
  it("generates script, scenes, shots and previews through jobs, at zero cost", async () => {
    const p = await newProject();
    const job = await generateScript(db, p.id);
    expect(job.status).toBe("succeeded");
    expect(job.provider).toBe("mock-text");

    const script = await getScript(db, p.id);
    expect(script?.logline).toBe("طفل يكتشف مدينة قديمة");
    const scenes = await listScenes(db, p.id);
    expect(scenes.length).toBe(5);
    expect(scenes.map((s) => s.position)).toEqual([1, 2, 3, 4, 5]);
    expect((await listShots(db, scenes.map((s) => s.id))).length).toBe(10);
    expect(scenes.every((s) => s.preview_asset_id)).toBe(true);
    expect((await getProject(db, p.id))!.status).toBe("storyboard_ready");
    expect((await listVersions(db, p.id)).length).toBe(1);

    // Preview is a real stored file of the right (draft) size.
    const asset = (await getAsset(db, scenes[0].preview_asset_id!))!;
    expect(asset.width).toBe(324);
    expect(asset.height).toBe(576);
    expect(new TextDecoder().decode(await readAssetBytes(asset))).toContain("<svg");

    // Cost ledger: 1 text call + 5 image calls, all mock, $0.
    const spend = await spendSummary(db, { projectId: p.id });
    expect(spend).toEqual({ calls: 6, mockCalls: 6, totalUsd: 0 });
    const est = estimateFromScenes(scenes);
    expect(est.find((e) => e.capability === "image")!.units).toBe(5);
    expect(est.find((e) => e.capability === "video")!.units).toBe(scenes.reduce((a, s) => a + s.duration_sec, 0));
    expect(est.every((e) => e.costUsd === 0 && e.isMock)).toBe(true);
  });

  it("works from pasted text too", async () => {
    const p = await newProject("text", "السطر الأول. السطر الثاني. السطر الثالث.");
    await generateScript(db, p.id);
    expect((await listScenes(db, p.id)).map((s) => s.narration)).toEqual(["السطر الأول.", "السطر الثاني.", "السطر الثالث."]);
  });

  it("regenerating a preview creates a new image; unchanged input reuses the old one", async () => {
    const p = await newProject();
    await generateScript(db, p.id);
    const [s] = await listScenes(db, p.id);
    const before = (await spendSummary(db, { projectId: p.id })).calls;
    await generatePreview(db, s.id, false); // identical input → reused, no call
    expect((await spendSummary(db, { projectId: p.id })).calls).toBe(before);
    await generatePreview(db, s.id, true);
    expect((await spendSummary(db, { projectId: p.id })).calls).toBe(before + 1);
    expect((await listScenes(db, p.id))[0].preview_asset_id).not.toBe(s.preview_asset_id);
  });
});

describe("storyboard editing", () => {
  it("edit, approve, reject, duplicate, reorder, delete, add", async () => {
    const p = await newProject();
    await generateScript(db, p.id);
    let scenes = await listScenes(db, p.id);
    const [a, b] = scenes;

    await updateScene(db, a.id, { title: "عنوان معدّل", duration_sec: 7, narration: "تعليق جديد" });
    await expect(updateScene(db, a.id, { duration_sec: 0 })).rejects.toThrow();
    scenes = await listScenes(db, p.id);
    expect(scenes[0]).toMatchObject({ title: "عنوان معدّل", duration_sec: 7, narration: "تعليق جديد" });

    await setSceneStatus(db, a.id, "approved");
    await updateScene(db, a.id, { title: "تعديل بعد الاعتماد" });
    expect((await listScenes(db, p.id))[0].status).toBe("draft"); // edited → needs review again

    await setSceneStatus(db, b.id, "rejected");
    await approveAll(db, p.id);
    scenes = await listScenes(db, p.id);
    expect(scenes.filter((s) => s.status === "approved").length).toBe(4);
    expect(scenes[1].status).toBe("rejected");
    expect((await getProject(db, p.id))!.status).toBe("approved");

    const copy = await duplicateScene(db, a.id);
    scenes = await listScenes(db, p.id);
    expect(scenes.length).toBe(6);
    expect(scenes[1].id).toBe(copy.id);
    expect(scenes[1].title).toBe("تعديل بعد الاعتماد");
    expect(scenes.map((s) => s.position)).toEqual([1, 2, 3, 4, 5, 6]);

    await moveScene(db, scenes[0].id, 1);
    expect((await listScenes(db, p.id))[1].id).toBe(scenes[0].id);
    await moveScene(db, scenes[0].id, 1);
    await moveScene(db, (await listScenes(db, p.id))[0].id, -1); // no-op at top
    const reversed = scenes.map((s) => s.id).reverse();
    await reorderScenes(db, p.id, reversed);
    expect((await listScenes(db, p.id)).map((s) => s.id)).toEqual(reversed);
    await expect(reorderScenes(db, p.id, reversed.slice(1))).rejects.toThrow();

    await deleteScene(db, reversed[0]);
    scenes = await listScenes(db, p.id);
    expect(scenes.length).toBe(5);
    expect(scenes.map((s) => s.position)).toEqual([1, 2, 3, 4, 5]);

    const added = await addScene(db, p.id, 2);
    scenes = await listScenes(db, p.id);
    expect(scenes[2].id).toBe(added.id);
    expect((await getProject(db, p.id))!.status).toBe("storyboard_ready"); // new draft scene needs approval

    await updateScript(db, p.id, { title: "عنوان النص", body: "نص كامل" });
    expect((await getScript(db, p.id))!.title).toBe("عنوان النص");
  });
});

describe("job queue", () => {
  it("retries failed jobs with backoff, then allows manual retry", async () => {
    let calls = 0;
    registerJobHandler("test.flaky", "text", async () => {
      calls++;
      if (calls < 3) throw new Error("boom " + calls);
      return { ok: true };
    });
    const { job } = await enqueueJob(db, { workspaceId: ws, type: "test.flaky", input: { a: 1 }, maxAttempts: 2 });
    let j = await runJob(db, job.id);
    expect(j.status).toBe("queued"); // will retry after backoff
    expect(j.error).toBe("boom 1");
    await db.query(`update generation_jobs set run_after=now() where id=$1`, [job.id]);
    expect(await processQueue(db)).toBe(1);
    j = (await getJob(db, job.id))!;
    expect(j.status).toBe("failed");
    expect(j.attempts).toBe(2);

    expect(await retryJob(db, job.id)).not.toBeNull();
    j = await runJob(db, job.id);
    expect(j.status).toBe("succeeded");
    expect(j.output).toEqual({ ok: true });
    const attempts = await db.query(`select * from job_attempts where job_id=$1`, [job.id]);
    expect(attempts.length).toBe(3);
  });

  it("deduplicates identical input (key order independent)", async () => {
    registerJobHandler("test.ok", "text", async () => ({ ok: 1 }));
    const a = await enqueueJob(db, { workspaceId: ws, type: "test.ok", input: { x: 1, y: 2 } });
    await runJob(db, a.job.id);
    const b = await enqueueJob(db, { workspaceId: ws, type: "test.ok", input: { y: 2, x: 1 } });
    expect(b.reused).toBe(true);
    expect(b.job.id).toBe(a.job.id);
  });
});

describe("assets", () => {
  it("stores uploads, deduplicates by checksum, rejects bad types", async () => {
    const bytes = new TextEncoder().encode("hello");
    const a = await saveAsset(db, { workspaceId: ws, source: "upload", mimeType: "text/plain", bytes, name: "a.txt" });
    const b = await saveAsset(db, { workspaceId: ws, source: "upload", mimeType: "text/plain", bytes, name: "b.txt" });
    expect(b.id).toBe(a.id);
    expect(a.kind).toBe("document");
    expect(new TextDecoder().decode(await readAssetBytes(a))).toBe("hello");
    await expect(saveAsset(db, { workspaceId: ws, source: "upload", mimeType: "application/x-msdownload", bytes })).rejects.toThrow();
    expect(await getAsset(db, "../../etc/passwd")).toBeNull();
  });
});
