import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { freshEnv } from "./helpers";
import { createProject } from "@/lib/projects";
import { generateScript, sceneIdentityInput } from "@/lib/studio";
import { listScenes } from "@/lib/scenes";
import {
  addKnowledge, addReference, createCharacter, createOutfit, deleteKnowledge, deleteOutfit, getIdentityPack, getVoice,
  listKnowledge, listOutfits, listReferences, setCharacterLocked, setReferenceRole, setVoiceLocked, updateKnowledge, updateVoice,
} from "@/lib/characters";
import { getProjectMemory, lockOutfitForScenes, setCharacterState, setSceneCharacters, setSceneOutfit } from "@/lib/scene-memory";
import { composeScenePrompt } from "@/lib/prompt";
import { saveAsset } from "@/lib/assets";

let db: Db;
let ws: string;
beforeEach(async () => {
  ({ db, workspaceId: ws } = await freshEnv());
});

const img = async (n: number) =>
  (await saveAsset(db, { workspaceId: ws, source: "upload", name: `r${n}.png`, mimeType: "image/png", bytes: new Uint8Array([137, 80, 78, 71, n]) })).id;

describe("reference image lock", () => {
  it("first image becomes primary; only one primary; roles are saved; lock needs a primary", async () => {
    const c = await createCharacter(db, ws, { name: "سالمة" });
    const a = await img(1), b = await img(2), d = await img(3);
    await addReference(db, c.id, a);
    await addReference(db, c.id, b, "face");
    await addReference(db, c.id, d, "outfit");
    let refs = await listReferences(db, c.id);
    expect(refs.find((r) => r.id === a)?.role).toBe("primary");
    expect(refs.find((r) => r.id === b)?.role).toBe("face");

    await setReferenceRole(db, c.id, b, "primary");
    refs = await listReferences(db, c.id);
    expect(refs.filter((r) => r.role === "primary").map((r) => r.id)).toEqual([b]);
    expect(refs[0].id).toBe(b); // primary first

    await setCharacterLocked(db, c.id, true);
    await expect(setReferenceRole(db, c.id, a, "pose")).rejects.toThrow(/مقفلة/);
    const pack = await getIdentityPack(db, c.id);
    expect(pack.primaryAssetId).toBe(b);
  });
});

describe("voice identity lock", () => {
  it("saves the voice, validates ranges, and refuses changes while locked", async () => {
    const c = await createCharacter(db, ws, { name: "سالمة" });
    expect((await getVoice(db, c.id)).provider).toBe("mock-voice");
    await updateVoice(db, c.id, { dialect: "omani", tone: "دافئة", speed: 0.9, pitch: 2, voice_id: "v-123" });
    const v = await getVoice(db, c.id);
    expect(v).toMatchObject({ dialect: "omani", tone: "دافئة", speed: 0.9, pitch: 2, voice_id: "v-123" });
    await expect(updateVoice(db, c.id, { speed: 5 })).rejects.toThrow();
    await setVoiceLocked(db, c.id, true);
    await expect(updateVoice(db, c.id, { tone: "حادة" })).rejects.toThrow(/مقفل/);
    expect((await getVoice(db, c.id)).tone).toBe("دافئة");
  });
});

describe("outfits across scenes", () => {
  it("pins an outfit for a range, carries it forward, feeds prompts and reference images", async () => {
    const c = await createCharacter(db, ws, { name: "سالمة", attributes: { hair: "حجاب أبيض" } });
    const primary = await img(10);
    await addReference(db, c.id, primary);
    const outfitImg = await img(11);
    const school = await createOutfit(db, c.id, { name: "زي المدرسة", description: "مريول أزرق", assetId: outfitImg });
    const party = await createOutfit(db, c.id, { name: "زي العيد", description: "فستان أخضر" });
    await expect(createOutfit(db, c.id, { name: "زي المدرسة" })).rejects.toThrow();

    const p = await createProject(db, { workspaceId: ws, title: "خبز ولبن", startType: "idea", inputText: "سالمة تذهب إلى المخبز", platformPreset: "instagram-reel", targetDurationSec: 30 });
    await generateScript(db, p.id);
    const scenes = await listScenes(db, p.id);
    expect(scenes.length).toBeGreaterThanOrEqual(4);
    for (const s of scenes) await setSceneCharacters(db, s.id, [c.id]);

    const n = await lockOutfitForScenes(db, p.id, c.id, school.id, 1, 3);
    expect(n).toBe(3);
    let mem = await getProjectMemory(db, p.id);
    expect(mem[scenes[1].id][0].effectiveOutfit?.name).toBe("زي المدرسة");
    expect(composeScenePrompt(scenes[2], mem[scenes[2].id])).toContain("مريول أزرق");

    // A deliberate change in scene 4 is saved and carries forward from there.
    await setSceneOutfit(db, scenes[3].id, c.id, party.id);
    mem = await getProjectMemory(db, p.id);
    expect(mem[scenes[3].id][0].effectiveOutfit?.name).toBe("زي العيد");
    expect(mem[scenes[2].id][0].effectiveOutfit?.name).toBe("زي المدرسة");

    // Explicit wardrobe text overrides the pinned outfit in that scene only... and range lock clears it.
    await setCharacterState(db, scenes[1].id, c.id, { wardrobe: "معطف مطر" });
    mem = await getProjectMemory(db, p.id);
    expect(mem[scenes[1].id][0].effective.wardrobe?.value).toBe("معطف مطر");
    await lockOutfitForScenes(db, p.id, c.id, school.id, 1, 3);
    mem = await getProjectMemory(db, p.id);
    expect(mem[scenes[1].id][0].effective.wardrobe?.value).toContain("زي المدرسة");

    // Reference images for the scene: primary first, then the outfit image.
    const input = await sceneIdentityInput(db, scenes[0]);
    expect(input.referenceAssetIds[0]).toBe(primary);
    expect(input.referenceAssetIds).toContain(outfitImg);

    // Outfit from another character is refused.
    const other = await createCharacter(db, ws, { name: "علي" });
    const otherOutfit = await createOutfit(db, other.id, { name: "زي" });
    await expect(setSceneOutfit(db, scenes[0].id, c.id, otherOutfit.id)).rejects.toThrow();
    await deleteOutfit(db, c.id, otherOutfit.id); // wrong owner: no-op
    expect(await listOutfits(db, other.id)).toHaveLength(1);
  });
});

describe("knowledge base", () => {
  it("adds, edits and deletes entries scoped to the character", async () => {
    const c = await createCharacter(db, ws, { name: "سالمة" });
    const other = await createCharacter(db, ws, { name: "علي" });
    const k = await addKnowledge(db, c.id, { title: "الدرس", content: "الخبز يُصنع من الدقيق." });
    await expect(addKnowledge(db, c.id, { title: "", content: "x" })).rejects.toThrow();
    await updateKnowledge(db, other.id, k.id, { content: "تخريب" });
    expect((await listKnowledge(db, c.id))[0].content).toBe("الخبز يُصنع من الدقيق.");
    await updateKnowledge(db, c.id, k.id, { content: "الخبز يُصنع من الدقيق والماء." });
    expect((await listKnowledge(db, c.id))[0].content).toContain("والماء");
    await deleteKnowledge(db, other.id, k.id);
    expect(await listKnowledge(db, c.id)).toHaveLength(1);
    await deleteKnowledge(db, c.id, k.id);
    expect(await listKnowledge(db, c.id)).toHaveLength(0);
  });
});
