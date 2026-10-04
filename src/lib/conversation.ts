import crypto from "node:crypto";
import type { Db } from "@/db/client";
import { getProvider } from "@/providers/registry";
import { recordProviderCall } from "./cost";
import { getIdentityPack, listKnowledge } from "./characters";
import { normalizeArabic, rankPassages, splitSentencesAr, stem, tokens, type Passage } from "./arabic";
import { animate, speak, voiceSettings } from "./talking";

/**
 * Conversational character. Answers come only from the character's knowledge base (plus the
 * project's): the question is matched to passages, an answer is written from them, and an
 * off-topic question is gently redirected, never answered from nothing. Three tiers reuse
 * each other: text (cached) → voice (cached job) → talking avatar (cached job).
 */
export type Tier = "text" | "voice" | "avatar";
export type Channel = "test" | "player";

export interface AskResult {
  conversationId: string;
  answer: string;
  inScope: boolean;
  cached: boolean;
  usedContext: boolean;
  sources: { id: string; title: string; text: string }[];
  audioAssetId: string | null;
  videoAssetId: string | null;
  notes: string[];
}

const SMALL_TALK: [RegExp, (name: string, intro: string, topics: string) => string][] = [
  [/^(السلام عليكم|سلام|مرحبا|اهلا|هلا|صباح|مساء|هاي)/, (n, intro, t) => `أهلًا وسهلًا! أنا ${n}${intro}. ${t ? `اسألني عن ${t}.` : "اسألني ما تشاء عن درسنا."}`],
  [/(من انت|ما اسمك|شو اسمك|وش اسمك|عرفي بنفسك|عرفني بنفسك)/, (n, intro, t) => `أنا ${n}${intro}. ${t ? `أعرف عن ${t}.` : ""}`.trim()],
  [/^(شكرا|مشكور|يعطيك العافيه|جزاك الله)/, (_n, _i, t) => `عفوًا! ${t ? `هل عندك سؤال آخر عن ${t}؟` : "هل عندك سؤال آخر؟"}`],
];

const FOLLOW_UP = /^(و|ف)?(لماذا|ليش|كيف|متى|واين|وماذا|ماذا عن|وبعد|ثم ماذا|طيب|يعني|وهل|وكم|هو|هي|هذا|ذلك)/;

export async function getOrCreateConversation(db: Db, characterId: string, channel: Channel, conversationId?: string | null, projectId?: string | null) {
  if (conversationId) {
    const [c] = await db.query<{ id: string }>(`select id from conversations where id=$1 and character_id=$2`, [conversationId, characterId]);
    if (c) return c.id;
  }
  const [c] = await db.query<{ id: string }>(
    `insert into conversations(character_id, project_id, channel) values ($1,$2,$3) returning id`, [characterId, projectId ?? null, channel]);
  return c.id;
}

export async function listMessages(db: Db, conversationId: string) {
  return db.query<{ id: string; role: "user" | "character"; text: string; tier: Tier | null; in_scope: boolean | null; cached: boolean;
    audio_asset_id: string | null; video_asset_id: string | null; created_at: string }>(
    `select * from conversation_messages where conversation_id=$1 order by created_at, role desc`, [conversationId]);
}

function buildPassages(entries: { id: string; title: string; content: string }[]): Passage[] {
  return entries.flatMap((e) => splitSentencesAr(e.content).map((text, i) => ({ id: `${e.id}:${i}`, entryId: e.id, title: e.title, text })));
}

export async function askCharacter(db: Db, args: {
  characterId: string; question: string; tier?: Tier; channel?: Channel; conversationId?: string | null; projectId?: string | null;
}): Promise<AskResult> {
  const question = args.question.trim();
  if (!question) throw new Error("اكتب سؤالك أولًا");
  if (question.length > 500) throw new Error("السؤال طويل جدًا");
  const tier = args.tier ?? "text";
  const pack = await getIdentityPack(db, args.characterId);
  const c = pack.character;
  const conversationId = await getOrCreateConversation(db, c.id, args.channel ?? "test", args.conversationId, args.projectId);
  const history = (await listMessages(db, conversationId)).slice(-6);
  const entries = await listKnowledge(db, c.id, args.projectId);
  const topics = entries.map((e) => e.title).slice(0, 3);
  const topicText = topics.join(" و");
  const notes: string[] = [];

  let answer = "", inScope = false, cached = false, usedContext = false;
  let sources: AskResult["sources"] = [];
  const norm = normalizeArabic(question);
  const small = SMALL_TALK.find(([re]) => re.test(norm));

  if (small && tokens(question).filter((t) => !/^(السلام|عليكم|مرحبا|اهلا|شكرا|اسمك|انت)$/.test(t)).length <= 1) {
    answer = small[1](c.name, c.description ? `، ${c.description}` : "", topicText);
    inScope = true;
  } else {
    const passages = buildPassages(entries);
    const qTerms = tokens(question).map(stem);
    let ranked = rankPassages(question, passages).results;
    const enough = (r: typeof ranked) => r.length > 0 && (qTerms.length < 2 || r[0].matched / new Set(qTerms).size >= 0.5);
    const prevUser = [...history].reverse().find((m) => m.role === "user");
    // Follow-up ("ولماذا؟", "وهل هي…"): read it together with the previous question. Only when the
    // question has no content of its own, or is marked as a follow-up and still touches the topic,
    // so an unrelated question after a good one is not answered from the old context.
    const isFollowUp = qTerms.length === 0 || (FOLLOW_UP.test(norm) && ranked.length > 0 && !enough(ranked));
    if (prevUser && isFollowUp) {
      const withCtx = rankPassages(question, passages, prevUser.text).results;
      const lastAnswer = [...history].reverse().find((m) => m.role === "character")?.text ?? "";
      const fresh = withCtx.filter((p) => !lastAnswer.includes(p.text));
      const pick = fresh.length ? fresh : withCtx;
      if (pick.length) { ranked = pick; usedContext = true; }
    }
    inScope = usedContext ? ranked.length > 0 : enough(ranked);
    // The best passage, plus the next one only when it is nearly as relevant.
    const top = inScope ? ranked.slice(0, 2).filter((p, k) => k === 0 || p.score >= ranked[0].score * 0.6).sort((a, b) => passages.indexOf(passages.find((p) => p.id === a.id)!) - passages.indexOf(passages.find((p) => p.id === b.id)!)) : [];
    sources = top.map((p) => ({ id: p.entryId, title: p.title, text: p.text }));

    const kbVersion = entries.map((e) => `${e.id}:${e.title}:${e.content}`).join("|");
    const key = crypto.createHash("sha256")
      .update([[...new Set(qTerms)].sort().join(" "), usedContext ? normalizeArabic(prevUser!.text) : "", kbVersion, JSON.stringify([c.name, c.description, c.attributes])].join("\n")).digest("hex");
    const [hit] = await db.query<{ answer: string; in_scope: boolean }>(`select answer, in_scope from answer_cache where character_id=$1 and cache_key=$2`, [c.id, key]);
    if (hit) {
      answer = hit.answer; inScope = hit.in_scope; cached = true;
      await db.query(`update answer_cache set hits=hits+1 where character_id=$1 and cache_key=$2`, [c.id, key]);
    } else {
      const provider = getProvider("text");
      const { result, usage } = await provider.answer({
        characterName: c.name, speakingStyle: c.attributes.speakingStyle ?? "", personality: c.attributes.personality ?? "",
        question, passages: top.map((p) => ({ title: p.title, text: p.text })), topics,
        history: history.map((m) => ({ role: m.role, text: m.text })), language: pack.voice.language, dialect: pack.voice.dialect,
      });
      answer = result.text;
      inScope = result.inScope && top.length > 0;
      await recordProviderCall(db, { workspaceId: c.workspace_id, projectId: args.projectId ?? null, provider: provider.info, usage });
      await db.query(
        `insert into answer_cache(character_id, cache_key, answer, in_scope, source_ids) values ($1,$2,$3,$4,$5) on conflict do nothing`,
        [c.id, key, answer, inScope, [...new Set(top.map((p) => p.entryId))]]);
    }
  }

  let audioAssetId: string | null = null, videoAssetId: string | null = null;
  if (tier !== "text") {
    const s = await speak(db, { workspaceId: c.workspace_id, projectId: args.projectId, text: answer, voice: voiceSettings(pack.voice) });
    audioAssetId = s.assetId;
    if (pack.voice.dialect && !s.output.dialectUsed) notes.push("مزوّد الصوت الحالي لا يدعم اللهجة المحددة، فلم يُدّعَ نطقها.");
    if (s.output.mock) notes.push("الصوت تجريبي (نغمات بإيقاع الجملة) حتى يُضاف مزوّد صوت.");
  }
  if (tier === "avatar") {
    if (!pack.primaryAssetId) notes.push("لا صورة رئيسية للشخصية، فاكتُفي بالصوت.");
    else {
      try {
        videoAssetId = (await animate(db, { workspaceId: c.workspace_id, projectId: args.projectId, imageAssetId: pack.primaryAssetId, audioAssetId: audioAssetId! })).assetId;
      } catch (e) {
        notes.push(e instanceof Error ? e.message : "تعذّر إنشاء الشخصية المتحدثة، فاكتُفي بالصوت.");
      }
    }
  }

  await db.query(`insert into conversation_messages(conversation_id, role, text) values ($1,'user',$2)`, [conversationId, question]);
  await db.query(
    `insert into conversation_messages(conversation_id, role, text, tier, in_scope, cached, source_ids, audio_asset_id, video_asset_id)
     values ($1,'character',$2,$3,$4,$5,$6,$7,$8)`,
    [conversationId, answer, tier, inScope, cached, [...new Set(sources.map((s) => s.id))], audioAssetId, videoAssetId]);
  return { conversationId, answer, inScope, cached, usedContext, sources, audioAssetId, videoAssetId, notes };
}
