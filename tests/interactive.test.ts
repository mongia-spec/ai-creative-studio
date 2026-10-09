import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { freshEnv } from "./helpers";
import { createProject } from "@/lib/projects";
import { generateScript } from "@/lib/studio";
import { listScenes } from "@/lib/scenes";
import { addInteraction, capTier, getSettings, interactionStats, listInteractions, readSettings, respond, saveSettings } from "@/lib/interactive";
import { screenQuestion } from "@/lib/safety";
import { addKnowledge, createCharacter } from "@/lib/characters";
import { askCharacter } from "@/lib/conversation";

let db: Db, ws: string;
beforeEach(async () => { ({ db, workspaceId: ws } = await freshEnv()); });

async function project() {
  const p = await createProject(db, { workspaceId: ws, startType: "text", platformPreset: "square", inputText: "مشهد أول. مشهد ثان. مشهد ثالث." });
  await generateScript(db, p.id);
  return { p, scenes: await listScenes(db, p.id) };
}

describe("interactive video", () => {
  it("questions, branches and hotspots validate and record answers", async () => {
    const { p, scenes } = await project();
    await expect(addInteraction(db, scenes[0].id, { kind: "question", atSec: 1, prompt: "س؟", choices: [{ label: "أ" }, { label: "ب" }] })).rejects.toThrow(/الصحيحة/);
    await expect(addInteraction(db, scenes[0].id, { kind: "question", atSec: 999, prompt: "س؟", choices: [{ label: "أ", correct: true }, { label: "ب" }] })).rejects.toThrow(/مدة/);
    await expect(addInteraction(db, scenes[0].id, { kind: "branch", atSec: 1, prompt: "أين؟", choices: [{ label: "أ", gotoPosition: 9 }, { label: "ب", gotoPosition: 2 }] })).rejects.toThrow();
    const q = await addInteraction(db, scenes[0].id, { kind: "question", atSec: 1, prompt: "س؟", choices: [{ label: "أ", correct: true }, { label: "ب" }] });
    const b = await addInteraction(db, scenes[1].id, { kind: "branch", atSec: 1, prompt: "أين؟", choices: [{ label: "البحر", gotoPosition: 3 }, { label: "البيت", gotoPosition: 1 }] });
    await addInteraction(db, scenes[2].id, { kind: "hotspot", atSec: 0, prompt: "الفرن", choices: [{ label: "فرن", feedback: "يخبز الخبز", x: 140, y: 30 }] });
    expect((await listInteractions(db, p.id)).map((x) => x.kind)).toEqual(["question", "branch", "hotspot"]);
    expect((await listInteractions(db, p.id))[2].choices[0].x).toBe(95);
    expect((await respond(db, q.id, 1)).correct).toBe(false);
    expect((await respond(db, q.id, 0)).correct).toBe(true);
    expect((await respond(db, b.id, 0)).gotoPosition).toBe(3);
    const stats = await interactionStats(db, p.id);
    expect(stats.find((s) => s.interaction_id === q.id)).toMatchObject({ answers: 2, correct: 1 });
  });

  it("creator settings cap the answer tier and limit askable characters", async () => {
    const { p } = await project();
    expect(await getSettings(db, p.id)).toEqual({ askable: [], allowAsk: true, allowMic: true, maxTier: "avatar" });
    await saveSettings(db, p.id, { askable: ["x"], allowAsk: true, allowMic: false, maxTier: "voice" });
    expect((await getSettings(db, p.id)).maxTier).toBe("voice");
    expect(capTier("avatar", "voice")).toBe("voice");
    expect(capTier("text", "voice")).toBe("text");
    expect(readSettings({ maxTier: "bogus" }).maxTier).toBe("avatar");
  });
});

describe("safe responses", () => {
  it("screens sensitive questions before any answer, with diacritics or not", async () => {
    expect(screenQuestion("ما رقم هاتفكِ؟")?.topic).toBe("personal");
    expect(screenQuestion("كيف أصنع قُنبُلة")?.topic).toBe("violence");
    expect(screenQuestion("مم يصنع الخبز")).toBeNull();
    const c = await createCharacter(db, ws, { name: "سالمة" });
    await addKnowledge(db, c.id, { title: "الخبز", content: "يصنع الخبز من الدقيق." });
    const r = await askCharacter(db, { characterId: c.id, question: "أعطيني عنوانك يا سالمة" });
    expect(r.safety).toBe("personal");
    expect(r.answer).toContain("خاصة");
    expect(r.sources).toHaveLength(0);
  });
});
