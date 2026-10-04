import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { freshEnv } from "./helpers";
import { addKnowledge, addReference, createCharacter, updateKnowledge } from "@/lib/characters";
import { askCharacter, listMessages } from "@/lib/conversation";
import { saveAsset } from "@/lib/assets";
import { placeholderSvg } from "@/providers/mock/image";
import { hasFfmpeg } from "@/lib/ffmpeg";

let db: Db;
let ws: string;
let salma: string;
beforeEach(async () => {
  ({ db, workspaceId: ws } = await freshEnv());
  salma = (await createCharacter(db, ws, { name: "سالمة", description: "طفلة عمانية تحب الخبز" })).id;
  await addKnowledge(db, salma, { title: "الخبز", content: "يُصنع الخبز من الدقيق والماء والخميرة. يُخبز العجين في الفرن حتى يصبح ذهبيًّا. نأكل الخبز في الفطور." });
  await addKnowledge(db, salma, { title: "اللبن", content: "اللبن يأتي من البقرة. نشرب اللبن لأنه مفيد للعظام والأسنان." });
});

describe("conversational character", () => {
  it("answers paraphrased questions from the knowledge base only, with sources", async () => {
    const r = await askCharacter(db, { characterId: salma, question: "مِمَّ يُصنع الخبز؟" });
    expect(r.inScope).toBe(true);
    expect(r.answer).toContain("الدقيق");
    expect(r.sources[0].title).toBe("الخبز");
    const r2 = await askCharacter(db, { characterId: salma, question: "ما مكونات صناعة الخبز", conversationId: r.conversationId });
    expect(r2.answer).toContain("الدقيق");
    const r3 = await askCharacter(db, { characterId: salma, question: "لماذا نشرب اللبن؟", conversationId: r.conversationId });
    expect(r3.answer).toContain("مفيد");
  });

  it("redirects off-topic questions gently without inventing", async () => {
    const r = await askCharacter(db, { characterId: salma, question: "مِن فاز بمباراة كرة القدم أمس؟" });
    expect(r.inScope).toBe(false);
    expect(r.sources).toHaveLength(0);
    expect(r.answer).toMatch(/لا أعرف/);
    expect(r.answer).toContain("الخبز");
  });

  it("keeps follow-up context, but not for unrelated questions", async () => {
    const a = await askCharacter(db, { characterId: salma, question: "كيف يُخبز العجين؟" });
    const b = await askCharacter(db, { characterId: salma, question: "ولماذا؟", conversationId: a.conversationId });
    expect(b.usedContext).toBe(true);
    expect(b.inScope).toBe(true);
    const c = await askCharacter(db, { characterId: salma, question: "ما عاصمة فرنسا؟", conversationId: a.conversationId });
    expect(c.inScope).toBe(false);
    expect((await listMessages(db, a.conversationId))).toHaveLength(6);
  });

  it("greets and introduces itself in character", async () => {
    const r = await askCharacter(db, { characterId: salma, question: "السلام عليكم" });
    expect(r.answer).toContain("أنا سالمة");
    const who = await askCharacter(db, { characterId: salma, question: "من أنتِ؟" });
    expect(who.answer).toContain("سالمة");
  });

  it("caches answers and invalidates them when the knowledge changes", async () => {
    const r1 = await askCharacter(db, { characterId: salma, question: "مم يصنع الخبز" });
    const r2 = await askCharacter(db, { characterId: salma, question: "مِمَّ يُصْنَعُ الخُبْزُ؟" });
    expect(r1.cached).toBe(false);
    expect(r2.cached).toBe(true);
    const [entry] = await db.query<{ id: string }>(`select id from character_knowledge where title='الخبز'`);
    await updateKnowledge(db, salma, entry.id, { content: "يُصنع الخبز من دقيق القمح والماء." });
    const r3 = await askCharacter(db, { characterId: salma, question: "مم يصنع الخبز" });
    expect(r3.cached).toBe(false);
    expect(r3.answer).toContain("القمح");
  });

  it("voice and avatar tiers reuse cached media", async () => {
    if (!(await hasFfmpeg())) return;
    const img = await saveAsset(db, { workspaceId: ws, source: "upload", name: "f.svg", mimeType: "image/svg+xml",
      bytes: new TextEncoder().encode(placeholderSvg({ width: 300, height: 300, label: "سالمة", prompt: "x", seed: "s" })) });
    await addReference(db, salma, img.id);
    const a = await askCharacter(db, { characterId: salma, question: "مم يصنع الخبز", tier: "avatar" });
    expect(a.audioAssetId).toBeTruthy();
    expect(a.videoAssetId).toBeTruthy();
    const b = await askCharacter(db, { characterId: salma, question: "مِمَّ يُصنع الخبز؟", tier: "avatar" });
    expect(b.videoAssetId).toBe(a.videoAssetId);
    const [{ n }] = await db.query<{ n: number }>(`select count(*)::int n from provider_calls`);
    expect(n).toBe(3); // one answer, one voice, one avatar
  }, 60000);
});
