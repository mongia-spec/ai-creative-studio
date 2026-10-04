import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { freshEnv } from "./helpers";
import { createProject } from "@/lib/projects";
import { generatePreview, generateScript, scenePrompt } from "@/lib/studio";
import { addShot, deleteShot, duplicateScene, getScene, listScenes, listShots, updateShot } from "@/lib/scenes";
import {
  addReference, characterDescriptor, createCharacter, deleteCharacter, getCharacter, listCharacters,
  listReferences, removeReference, setCharacterLocked, updateCharacter,
} from "@/lib/characters";
import { getProjectMemory, setCharacterState, setSceneCharacters } from "@/lib/scene-memory";
import { saveAsset } from "@/lib/assets";
import { spendSummary } from "@/lib/cost";

let db: Db;
let ws: string;
beforeEach(async () => {
  ({ db, workspaceId: ws } = await freshEnv());
});

const png = (n: number) => new Uint8Array([137, 80, 78, 71, n]);

describe("character library", () => {
  it("creates, edits, locks and protects characters", async () => {
    const c = await createCharacter(db, ws, { name: "سلمى", description: "طفلة فضولية", attributes: { hair: "شعر أسود قصير", ageRange: "8-10 سنوات", bogus: "x" } });
    expect(c.attributes).toEqual({ hair: "شعر أسود قصير", ageRange: "8-10 سنوات" });
    await expect(createCharacter(db, ws, { name: "سلمى" })).rejects.toThrow();
    await expect(createCharacter(db, ws, { name: "  " })).rejects.toThrow();

    await updateCharacter(db, c.id, { attributes: { hair: "شعر أسود قصير", clothing: "فستان أزرق" } });
    expect((await getCharacter(db, c.id))!.attributes.clothing).toBe("فستان أزرق");
    expect(characterDescriptor((await getCharacter(db, c.id))!)).toBe("سلمى: طفلة فضولية، شعر أسود قصير، فستان أزرق");

    const img = await saveAsset(db, { workspaceId: ws, source: "upload", mimeType: "image/png", bytes: png(1) });
    const txt = await saveAsset(db, { workspaceId: ws, source: "upload", mimeType: "text/plain", bytes: png(2) });
    await addReference(db, c.id, img.id);
    await expect(addReference(db, c.id, txt.id)).rejects.toThrow();
    expect((await listReferences(db, c.id)).map((a) => a.id)).toEqual([img.id]);

    await setCharacterLocked(db, c.id, true);
    await expect(updateCharacter(db, c.id, { name: "سلوى" })).rejects.toThrow(/مقفلة/);
    await expect(removeReference(db, c.id, img.id)).rejects.toThrow(/مقفلة/);
    await expect(deleteCharacter(db, c.id)).rejects.toThrow(/مقفلة/);
    await setCharacterLocked(db, c.id, false);
    await removeReference(db, c.id, img.id);
    const [row] = await listCharacters(db, ws);
    expect(row.reference_count).toBe(0);
    await deleteCharacter(db, c.id);
    expect(await listCharacters(db, ws)).toEqual([]);
  });
});

describe("characters in scenes + scene memory", () => {
  async function setup() {
    const salma = await createCharacter(db, ws, { name: "سلمى", attributes: { hair: "ضفيرتان" } });
    const omar = await createCharacter(db, ws, { name: "عمر" });
    const p = await createProject(db, {
      workspaceId: ws, startType: "text", platformPreset: "instagram-reel",
      inputText: "خرجت سلمى من البيت. وصلت إلى السوق. التقت سلمى بعمر. عادا معًا.",
    });
    await generateScript(db, p.id);
    return { salma, omar, p, scenes: await listScenes(db, p.id) };
  }

  it("auto-links characters named in the generated scenes", async () => {
    const { p, scenes, salma, omar } = await setup();
    const mem = await getProjectMemory(db, p.id);
    expect(mem[scenes[0].id].map((c) => c.characterId)).toEqual([salma.id]);
    expect(mem[scenes[1].id]).toEqual([]);
    expect(mem[scenes[2].id].map((c) => c.characterId).sort()).toEqual([salma.id, omar.id].sort());
  });

  it("carries state forward until changed, and feeds it into the prompt", async () => {
    const { p, scenes, salma } = await setup();
    await setCharacterState(db, scenes[0].id, salma.id, { wardrobe: "معطف أحمر", junk: "x" });
    await setSceneCharacters(db, scenes[3].id, [salma.id]);
    let mem = await getProjectMemory(db, p.id);
    const s3 = mem[scenes[2].id].find((c) => c.characterId === salma.id)!;
    expect(s3.effective.wardrobe).toEqual({ value: "معطف أحمر", fromPosition: 1 });
    expect(s3.own).toEqual({});

    await setCharacterState(db, scenes[2].id, salma.id, { wardrobe: "عباءة بيج" });
    mem = await getProjectMemory(db, p.id);
    expect(mem[scenes[3].id][0].effective.wardrobe).toEqual({ value: "عباءة بيج", fromPosition: 3 });
    expect(mem[scenes[0].id][0].effective.wardrobe!.value).toBe("معطف أحمر");

    const prompt = await scenePrompt(db, (await getScene(db, scenes[3].id))!);
    expect(prompt).toContain("الشخصية سلمى: ضفيرتان — الملابس: عباءة بيج");

    // State only on scenes where the character appears.
    await expect(setCharacterState(db, scenes[1].id, salma.id, { wardrobe: "x" })).rejects.toThrow();
    // Removing a character from a scene drops its state there.
    await setSceneCharacters(db, scenes[2].id, []);
    mem = await getProjectMemory(db, p.id);
    expect(mem[scenes[3].id][0].effective.wardrobe!.value).toBe("معطف أحمر");
  });

  it("changing a character's look regenerates the preview; unchanged reuses it", async () => {
    const { p, scenes, salma } = await setup();
    const before = (await spendSummary(db, { projectId: p.id })).calls;
    await generatePreview(db, scenes[0].id, false);
    expect((await spendSummary(db, { projectId: p.id })).calls).toBe(before); // reused
    await setCharacterState(db, scenes[0].id, salma.id, { props: "سلة" });
    await generatePreview(db, scenes[0].id, false);
    expect((await spendSummary(db, { projectId: p.id })).calls).toBe(before + 1);
  });

  it("rejects characters from another workspace, and duplicates keep the cast", async () => {
    const { scenes, salma } = await setup();
    await expect(setSceneCharacters(db, scenes[0].id, ["00000000-0000-0000-0000-000000000000"])).rejects.toThrow();
    const copy = await duplicateScene(db, scenes[0].id);
    const mem = await getProjectMemory(db, scenes[0].project_id);
    expect(mem[copy.id].map((c) => c.characterId)).toEqual([salma.id]);
  });
});

describe("shots", () => {
  it("add, edit, delete keeps positions compact", async () => {
    const p = await createProject(db, { workspaceId: ws, startType: "idea", inputText: "فكرة قصيرة", platformPreset: "square" });
    await generateScript(db, p.id);
    const [s] = await listScenes(db, p.id);
    await addShot(db, s.id);
    let shots = await listShots(db, [s.id]);
    expect(shots.map((x) => x.position)).toEqual([1, 2, 3]);
    await updateShot(db, shots[2].id, { description: "لقطة قريبة للوجه", duration_sec: 2 });
    await expect(updateShot(db, shots[2].id, { duration_sec: 0 })).rejects.toThrow();
    await deleteShot(db, shots[0].id);
    shots = await listShots(db, [s.id]);
    expect(shots.map((x) => x.position)).toEqual([1, 2]);
    expect(shots[1].description).toBe("لقطة قريبة للوجه");
  });
});
