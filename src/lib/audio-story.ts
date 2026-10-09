import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { Db } from "@/db/client";
import { getAsset, readAssetBytes, saveAsset } from "./assets";
import { normalizeArabic, splitSentencesAr, stem } from "./arabic";
import { EXT_BY_MIME, hasFfmpeg, runFfmpeg, withTempDir } from "./ffmpeg";

/**
 * Audio-to-video, locally and for free:
 *  1. the narrator's text (typed, pasted or transcribed in the browser) is split into shots;
 *  2. shots are timed against the recording using its pauses (FFmpeg silencedetect);
 *  3. characters, places, actions and objects are taken ONLY from the words of the text;
 *  4. each action becomes a body movement (never lip movement: the voice is the narrator's);
 *  5. each shot gets the best existing asset (ready clip > uploaded image > character picture).
 * Nothing here generates images or video. Shots without a fitting asset get a ready prompt for a
 * video provider and are marked as such.
 */

export interface StoryAction { verb: string; motion: string; at: number; who: string }
export interface StoryShot {
  index: number; text: string; start: number; end: number;
  characters: string[]; inferredCharacter: boolean; place: string | null; placeCarried: boolean;
  actions: StoryAction[]; expression: string | null; visual: string; motionPrompt: string;
  asset: { kind: "clip" | "image" | "character" | "placeholder"; assetId: string | null; name: string; score: number };
}
export interface StoryScene { index: number; place: string | null; shots: StoryShot[] }
export interface StoryAnalysis {
  audioAssetId: string; duration: number; transcript: string; timing: "pauses" | "proportional";
  characters: { name: string; id: string }[]; places: string[]; scenes: StoryScene[];
}

// ---------- Text analysis (rules + lexicons; nothing outside the text is added) ----------

type Lex = { forms: string[]; f: string; m: string };
/** Base forms after normalizeArabic (أ→ا، ى→ي، ة→ه). Present-tense stems listed where they differ. */
const VERBS: Lex[] = [
  { forms: ["ذهب", "توجه", "انطلق", "مضي", "سار", "مشي", "مشت"], f: "تمشي متجهةً{to}", m: "يمشي متجهًا{to}" },
  { forms: ["عاد", "عود", "رجع"], f: "تمشي عائدةً{to}", m: "يمشي عائدًا{to}" },
  { forms: ["دخل"], f: "تدخل{to}", m: "يدخل{to}" },
  { forms: ["خرج"], f: "تخرج{from}", m: "يخرج{from}" },
  { forms: ["وصل", "صل"], f: "تصل{to} وتتوقف", m: "يصل{to} ويتوقف" },
  { forms: ["ركض", "جري", "جرت"], f: "تركض{to}", m: "يركض{to}" },
  { forms: ["اشتري", "اشتر", "شتري"], f: "تشتري{obj}: تمدّ يدها وتأخذه", m: "يشتري{obj}: يمدّ يده ويأخذه" },
  { forms: ["اخذ", "خذ", "تناول"], f: "تأخذ{obj} بيدها", m: "يأخذ{obj} بيده" },
  { forms: ["حمل"], f: "تحمل{obj}", m: "يحمل{obj}" },
  { forms: ["اعطي", "عطي", "اعط", "ناول"], f: "تناول{obj}", m: "يناول{obj}" },
  { forms: ["اكل", "كل"], f: "تأكل{obj}", m: "يأكل{obj}" },
  { forms: ["شرب"], f: "تشرب{obj}", m: "يشرب{obj}" },
  { forms: ["جلس"], f: "تجلس", m: "يجلس" },
  { forms: ["وقف", "قف", "نهض", "قام", "قوم"], f: "تقف", m: "يقف" },
  { forms: ["فتح"], f: "تفتح{obj}", m: "يفتح{obj}" },
  { forms: ["اغلق", "غلق"], f: "تغلق{obj}", m: "يغلق{obj}" },
  { forms: ["نظر", "شاهد"], f: "تنظر{at}", m: "ينظر{at}" },
  { forms: ["ابتسم", "بتسم"], f: "تبتسم", m: "يبتسم" },
  { forms: ["ضحك"], f: "تضحك بلا صوت", m: "يضحك بلا صوت" },
  { forms: ["قال", "قول", "سال", "نادي", "صاح"], f: "تلتفت وتشير بيدها (الكلام بصوت الراوي، لا تتحرك الشفاه)", m: "يلتفت ويشير بيده (الكلام بصوت الراوي، لا تتحرك الشفاه)" },
  { forms: ["نام", "نوم"], f: "تستلقي وتغمض عينيها", m: "يستلقي ويغمض عينيه" },
  { forms: ["استيقظ", "ستيقظ", "صحا", "صحو"], f: "تستيقظ وتنهض", m: "يستيقظ وينهض" },
  { forms: ["غسل"], f: "تغسل{obj}", m: "يغسل{obj}" },
  { forms: ["طبخ"], f: "تطبخ{obj}", m: "يطبخ{obj}" },
  { forms: ["خبز"], f: "تخبز{obj}", m: "يخبز{obj}" },
  { forms: ["عجن"], f: "تعجن{obj}", m: "يعجن{obj}" },
  { forms: ["وضع", "ضع"], f: "تضع{obj}", m: "يضع{obj}" },
  { forms: ["سكب", "صب"], f: "تسكب{obj}", m: "يسكب{obj}" },
  { forms: ["ساعد"], f: "تساعد{obj}", m: "يساعد{obj}" },
  { forms: ["شكر"], f: "تشكر{obj} بإيماءة وابتسامة", m: "يشكر{obj} بإيماءة وابتسامة" },
  { forms: ["حيا", "لوح"], f: "تلوّح بيدها", m: "يلوّح بيده" },
  { forms: ["لعب"], f: "تلعب{obj}", m: "يلعب{obj}" },
  { forms: ["قرا"], f: "تقرأ{obj}", m: "يقرأ{obj}" },
  { forms: ["كتب"], f: "تكتب{obj}", m: "يكتب{obj}" },
  { forms: ["لبس", "ارتدي", "رتدي"], f: "ترتدي{obj}", m: "يرتدي{obj}" },
];
const PAST_SUFFIX = ["", "ت", "وا", "ا", "تا", "ن", "نا"];
const PRESENT_PREFIX = ["ي", "ت", "ا", "ن"];
const PRESENT_SUFFIX = ["", "ون", "ان", "ين", "وا", "ن"];

const PLACES = ["المخبز", "البيت", "المنزل", "الغرفه", "المطبخ", "السوق", "المدرسه", "الفصل", "الصف", "الحديقه", "الشارع", "الدكان",
  "المتجر", "البقاله", "الحقل", "المزرعه", "المسجد", "الشاطئ", "البحر", "الملعب", "المكتبه", "الحي", "القريه", "المدينه", "الفرن", "الساحه"];
const EXPRESSIONS: [string[], string, string][] = [
  [["سعيد", "سعيده", "فرح", "فرحه", "مسرور", "مسروره"], "سعيدة", "سعيد"],
  [["حزين", "حزينه"], "حزينة", "حزين"], [["خائف", "خائفه", "خايف", "خايفه"], "خائفة", "خائف"],
  [["متعب", "متعبه"], "متعبة", "متعب"], [["غاضب", "غاضبه"], "غاضبة", "غاضب"], [["جائع", "جائعه", "جايع", "جايعه"], "جائعة", "جائع"],
];

function stripConj(t: string) {
  for (const p of ["و", "ف"]) if (t.startsWith(p) && t.length > 3) return t.slice(1);
  return t;
}

/** Strict verb match: whole word = base form + known conjugation affixes, so names like «سالمة» never match «سأل». */
export function matchVerb(word: string): { lex: Lex; feminine: boolean } | null {
  const raw = normalizeArabic(word);
  for (const t of new Set([raw, stripConj(raw)])) {
    if (t.startsWith("ال")) continue;
    for (const lex of VERBS) for (const f of lex.forms) {
      for (const s of PAST_SUFFIX) if (t === f + s) return { lex, feminine: s === "ت" || s === "تا" || s === "ن" };
      for (const p of PRESENT_PREFIX) for (const s of PRESENT_SUFFIX) {
        if (t === p + f + s || t === p + f.replace(/^ا/, "") + s) return { lex, feminine: p === "ت" };
      }
    }
  }
  return null;
}

const words = (s: string) => s.split(/\s+/).map((w) => w.replace(/[.,،؛:!?؟…"«»()]/g, "")).filter(Boolean);

/** Split one sentence into shots: a new shot starts at each further action («ثم/و + فعل»). */
export function splitShots(sentence: string): string[] {
  const ws = sentence.split(/\s+/);
  const cuts: number[] = [];
  let seen = 0;
  ws.forEach((w, i) => {
    if (!matchVerb(w.replace(/[.,،؛:!?؟…"«»()]/g, ""))) return;
    if (seen++ === 0) return;
    cuts.push(i > 0 && normalizeArabic(ws[i - 1]).replace(/[،,]/g, "") === "ثم" ? i - 1 : i);
  });
  if (!cuts.length) return [sentence.trim()];
  const parts: string[] = [];
  let from = 0;
  for (const c of cuts) { if (c > from) parts.push(ws.slice(from, c).join(" ")); from = c; }
  parts.push(ws.slice(from).join(" "));
  return parts.map((p) => p.replace(/^[،,\s]+|[،,\s]+$/g, "")).filter((p) => p.length > 1);
}

interface Parsed { characters: string[]; place: string | null; actions: { verb: string; lex: Lex; feminine: boolean; obj: string | null; to: string | null; pos: number }[]; expression: string | null }

function parseShot(text: string, characterNames: string[]): Parsed {
  const n = normalizeArabic(text);
  const ws = words(text);
  const nws = ws.map((w) => stripConj(normalizeArabic(w)));
  const characters = characterNames.filter((c) => n.includes(normalizeArabic(c)));
  let place: string | null = null;
  nws.forEach((w, i) => {
    if (place) return;
    const prev = i > 0 ? normalizeArabic(ws[i - 1]) : "";
    if (PLACES.includes(w) || (w.startsWith("ال") && ["الي", "نحو"].includes(prev) && w.length > 3)) place = ws[i].replace(/^[وف](?=ال)/, "");
  });
  const actions: Parsed["actions"] = [];
  let pos = 0;
  ws.forEach((w, i) => {
    const m = matchVerb(w);
    const at = text.indexOf(w, pos);
    if (at >= 0) pos = at;
    if (!m) return;
    const next = ws[i + 1] ?? "";
    const nn = nws[i + 1] ?? "";
    // Object: the next word when it is a definite noun (اشترت الخبز); destination: «إلى …».
    const obj = nn.startsWith("ال") && !PLACES.includes(nn) ? next : null;
    const toIdx = nws.findIndex((x, k) => k > i && (x === "الي" || x === "نحو"));
    const to = toIdx >= 0 && ws[toIdx + 1] ? ws[toIdx + 1] : null;
    actions.push({ verb: w, ...m, obj, to, pos: Math.max(0, at) });
  });
  let expression: string | null = null;
  for (const w of nws) for (const [forms, f, m] of EXPRESSIONS) if (!expression && forms.includes(w)) expression = w.endsWith("ه") ? f : m;
  return { characters, place, actions, expression };
}

function motionText(a: Parsed["actions"][number], who: string, place: string | null) {
  const tpl = a.feminine ? a.lex.f : a.lex.m;
  const dest = a.to ?? (/{to}/.test(tpl) ? place : null);
  return `${who} ${tpl
    .replace("{to}", dest ? ` إلى ${dest}` : "")
    .replace("{from}", place ? ` من ${place}` : "")
    .replace("{obj}", a.obj ? ` ${a.obj}` : "")
    .replace("{at}", a.obj ? ` إلى ${a.obj}` : "")}`.trim();
}

// ---------- Timing against the recording ----------

/** Pauses in the recording (start, end) found by FFmpeg; empty when FFmpeg is missing. */
export async function detectPauses(file: string): Promise<[number, number][]> {
  if (!(await hasFfmpeg())) return [];
  const stderr: string = await new Promise((resolve) => execFile(/*turbopackIgnore: true*/ process.env.FFMPEG_PATH || "ffmpeg",
    ["-hide_banner", "-i", file, "-af", "silencedetect=noise=-32dB:d=0.25", "-f", "null", "-"], { timeout: 120000, maxBuffer: 1 << 24 },
    (_e, _o, err) => resolve(String(err))));
  const out: [number, number][] = [];
  let s: number | null = null;
  for (const line of stderr.split("\n")) {
    const a = /silence_start: (-?[\d.]+)/.exec(line);
    const b = /silence_end: ([\d.]+)/.exec(line);
    if (a) s = Math.max(0, Number(a[1]));
    if (b && s !== null) { out.push([s, Number(b[1])]); s = null; }
  }
  return out;
}

const weight = (t: string) => normalizeArabic(t).replace(/\s+/g, "").length || 1;

/**
 * Time each piece of text inside [0, duration]: spread by text length over the speaking time only,
 * then snap each boundary to the nearest pause (readers pause between sentences).
 */
export function alignPieces(pieces: string[], duration: number, pauses: [number, number][]) {
  const speech: [number, number][] = [];
  let t = 0;
  for (const [a, b] of pauses) { if (a > t) speech.push([t, Math.min(a, duration)]); t = Math.max(t, b); }
  if (t < duration) speech.push([t, duration]);
  const total = speech.reduce((x, [a, b]) => x + (b - a), 0);
  const timing: StoryAnalysis["timing"] = pauses.length && total > 0 ? "pauses" : "proportional";
  const atSpeech = (frac: number) => {
    if (timing === "proportional") return frac * duration;
    let left = frac * total;
    for (const [a, b] of speech) { if (left <= b - a) return a + left; left -= b - a; }
    return duration;
  };
  const W = pieces.reduce((x, p) => x + weight(p), 0);
  let acc = 0;
  const bounds = [0];
  const used = new Set<number>();
  for (let i = 0; i < pieces.length - 1; i++) {
    acc += weight(pieces[i]);
    let b = atSpeech(acc / W);
    let best = -1, bestD = 1.5;
    pauses.forEach(([a, e], k) => { const mid = (a + e) / 2; const d = Math.abs(mid - b); if (!used.has(k) && d < bestD && mid > bounds.at(-1)! + 0.3) { best = k; bestD = d; } });
    if (best >= 0) { used.add(best); b = (pauses[best][0] + pauses[best][1]) / 2; }
    bounds.push(Math.max(bounds.at(-1)! + 0.3, Math.min(b, duration - 0.3 * (pieces.length - 1 - i))));
  }
  bounds.push(duration);
  return { timing, spans: pieces.map((_, i) => [round(bounds[i]), round(bounds[i + 1])] as [number, number]) };
}
const round = (n: number) => Math.round(n * 100) / 100;

// ---------- Existing assets ----------

interface PoolItem { id: string; kind: "video" | "image"; name: string; terms: Set<string>; character?: string }

async function assetPool(db: Db, workspaceId: string, projectId: string | null, characters: { id: string; name: string }[]): Promise<PoolItem[]> {
  const rows = await db.query<{ id: string; kind: "video" | "image"; name: string | null }>(
    `select id, kind, name from assets where workspace_id=$1 and source='upload' and kind in ('image','video')
       and ($2::uuid is null or project_id is null or project_id=$2) order by created_at desc limit 500`, [workspaceId, projectId]);
  const refs = characters.length ? await db.query<{ asset_id: string; character_id: string }>(
    `select distinct on (character_id) asset_id, character_id from character_references where character_id = any($1::uuid[])
     order by character_id, (role='primary') desc, created_at`, [characters.map((c) => c.id)]) : [];
  const refIds = new Set(refs.map((r) => r.asset_id));
  const terms = (s: string) => new Set(words(s.replace(/[_\-.]/g, " ")).map((w) => stem(stripConj(normalizeArabic(w)))).filter((w) => w.length > 1));
  return [
    ...rows.filter((r) => !refIds.has(r.id) || r.kind === "video").map((r) => ({ id: r.id, kind: r.kind, name: r.name ?? "", terms: terms((r.name ?? "").replace(/\.[a-z0-9]+$/i, "")) })),
    ...refs.map((r) => ({ id: r.asset_id, kind: "image" as const, name: "", terms: new Set<string>(), character: characters.find((c) => c.id === r.character_id)!.name })),
  ];
}

function pickAsset(pool: PoolItem[], shot: { text: string; characters: string[]; place: string | null; actions: { verb: string; obj: string | null }[] }): StoryShot["asset"] {
  const want = new Set(words([shot.text, shot.place ?? "", ...shot.characters].join(" ")).map((w) => stem(stripConj(normalizeArabic(w)))).filter((w) => w.length > 1));
  const verbs = new Set(shot.actions.map((a) => stem(stripConj(normalizeArabic(a.verb)))));
  let best: { item: PoolItem; score: number } | null = null;
  for (const item of pool) {
    if (item.character) continue;
    let score = 0;
    for (const t of item.terms) if (want.has(t)) score += verbs.has(t) ? 2 : 1;
    // A ready clip must clearly fit (e.g. character + action); an image needs one shared word.
    const enough = item.kind === "video" ? score >= 2 : score >= 1;
    const rank = score + (item.kind === "video" ? 0.5 : 0);
    if (enough && (!best || rank > best.score)) best = { item, score: rank };
  }
  if (best) return { kind: best.item.kind === "video" ? "clip" : "image", assetId: best.item.id, name: best.item.name, score: Math.floor(best.score) };
  const ref = pool.find((p) => p.character && shot.characters.includes(p.character));
  if (ref) return { kind: "character", assetId: ref.id, name: `صورة ${ref.character} المرجعية`, score: 0 };
  return { kind: "placeholder", assetId: null, name: "", score: 0 };
}

// ---------- Analysis ----------

export async function analyzeStory(db: Db, args: { workspaceId: string; projectId?: string | null; audioAssetId: string; transcript: string; extraCharacters?: string[] }): Promise<StoryAnalysis> {
  const audio = await getAsset(db, args.audioAssetId);
  if (!audio || audio.kind !== "audio" || audio.workspace_id !== args.workspaceId) throw new Error("التسجيل غير موجود");
  const transcript = args.transcript.replace(/\s+\n/g, "\n").trim();
  if (transcript.length < 3) throw new Error("اكتبي النص المقروء أو صحّحي التفريغ أولًا");
  if (transcript.length > 5000) throw new Error("النص طويل لفقرة واحدة. جرّبي فقرة واحدة في كل مرة.");
  let duration = audio.duration_sec == null ? 0 : Number(audio.duration_sec);
  let pauses: [number, number][] = [];
  await withTempDir(async (dir) => {
    const f = path.join(dir, `a.${EXT_BY_MIME[audio.mime_type] ?? "bin"}`);
    await fs.writeFile(f, await readAssetBytes(audio));
    pauses = await detectPauses(f);
  });
  if (!duration) throw new Error("تعذّر قياس مدة التسجيل");
  // Leading/trailing silence belongs to the first/last shot, not a boundary between shots.
  pauses = pauses.filter(([a, b]) => a > 0.05 && b < duration - 0.05);

  const library = await db.query<{ id: string; name: string }>(`select id, name from characters where workspace_id=$1`, [args.workspaceId]);
  // Characters typed by the user for this story join the library ones (created with the project).
  const extra = (args.extraCharacters ?? []).map((n) => n.trim()).filter((n) => n.length > 1 && n.length <= 80)
    .filter((n, i, a) => a.indexOf(n) === i && !library.some((c) => c.name === n)).slice(0, 12);
  const characters = [...library, ...extra.map((name) => ({ id: "", name }))].sort((a, b) => b.name.length - a.name.length);
  const names = characters.map((c) => c.name);
  const pieces = splitSentencesAr(transcript).flatMap(splitShots);
  if (!pieces.length) throw new Error("لم أجد جملًا في النص");
  const { timing, spans } = alignPieces(pieces, duration, pauses);
  const pool = await assetPool(db, args.workspaceId, args.projectId ?? null, library);

  let lastChar: string[] = [];
  let lastPlace: string | null = null;
  const shots: StoryShot[] = pieces.map((text, i) => {
    const p = parseShot(text, names);
    const [start, end] = spans[i];
    const inferred = !p.characters.length && p.actions.length > 0 && lastChar.length > 0;
    const chars = p.characters.length ? p.characters : inferred ? lastChar : [];
    if (p.characters.length) lastChar = p.characters;
    const placeCarried = !p.place && !!lastPlace;
    const place = p.place ?? lastPlace;
    // Movement verbs lead to the destination: later shots continue there.
    lastPlace = p.actions.find((a) => a.to)?.to ?? p.place ?? lastPlace;
    const who = chars.join(" و") || "الشخصية";
    const len = Math.max(1, text.length);
    const actions: StoryAction[] = p.actions.map((a) => ({
      verb: a.verb, who, motion: motionText(a, who, place), at: round(start + (end - start) * (a.pos / len)),
    }));
    const visual = [
      chars.length ? chars.join(" و") : null,
      actions.length ? actions.map((a) => a.motion.replace(`${who} `, "")).join("، ثم ") : null,
      place ? `المكان: ${place}` : null,
      p.expression ? `التعبير: ${p.expression}` : null,
    ].filter(Boolean).join(" — ") || text;
    const motionPrompt = [
      `لقطة فيديو مدتها ${round(end - start)} ثانية.`,
      chars.length ? `الشخصية: ${chars.join("، ")} بنفس الهوية والملابس المرجعية تمامًا.` : null,
      place ? `المكان: ${place}، بنفس الديكور في كل اللقطات.` : null,
      actions.length ? `الحركة: ${actions.map((a) => a.motion).join("، ثم ")}.` : "الحركة: حركة كاميرا هادئة فقط.",
      p.expression ? `تعبير الوجه: ${p.expression}.` : null,
      "لا كلام ولا حركة شفاه؛ الصوت للراوي فقط. لا عناصر غير مذكورة في النص.",
    ].filter(Boolean).join(" ");
    const asset = pickAsset(pool, { text, characters: chars, place, actions: p.actions });
    return { index: i + 1, text, start, end, characters: chars, inferredCharacter: inferred, place, placeCarried, actions, expression: p.expression, visual, motionPrompt, asset };
  });

  const scenes: StoryScene[] = [];
  for (const s of shots) {
    const cur = scenes.at(-1);
    if (cur && cur.place === s.place) cur.shots.push(s);
    else scenes.push({ index: scenes.length + 1, place: s.place, shots: [s] });
  }
  return {
    audioAssetId: audio.id, duration: round(duration), transcript, timing,
    characters: characters.filter((c) => shots.some((s) => s.characters.includes(c.name))),
    places: [...new Set(shots.map((s) => s.place).filter(Boolean) as string[])],
    scenes,
  };
}

// ---------- Project from the analysis ----------

/** A still frame of a clip, so storyboards and timelines can show it without decoding video. */
async function clipThumbnail(db: Db, workspaceId: string, projectId: string, videoId: string): Promise<string | null> {
  const v = await getAsset(db, videoId);
  if (!v || !(await hasFfmpeg())) return null;
  return withTempDir(async (dir) => {
    const src = path.join(dir, `v.${EXT_BY_MIME[v.mime_type] ?? "mp4"}`);
    await fs.writeFile(src, await readAssetBytes(v));
    const out = path.join(dir, "t.jpg");
    await runFfmpeg(["-ss", "0.5", "-i", src, "-frames:v", "1", "-q:v", "4", out]).catch(() => runFfmpeg(["-i", src, "-frames:v", "1", out]));
    const bytes = new Uint8Array(await fs.readFile(out));
    return (await saveAsset(db, { workspaceId, projectId, source: "generated", name: "clip-thumb", mimeType: "image/jpeg", bytes })).id;
  });
}

export const PROJECT_KINDS = [["story", "قصة"], ["film", "فيلم قصير"], ["ad", "إعلان"], ["social", "محتوى سوشيال"], ["educational", "فيديو تعليمي"]] as const;

export async function createStoryProject(db: Db, args: {
  workspaceId: string; analysis: StoryAnalysis; title?: string; platformPreset?: string;
  kind?: string; style?: string; quality?: "draft" | "standard";
}): Promise<string> {
  const { analysis: a } = args;
  const { createProject } = await import("./projects");
  const { getPreset } = await import("@/config/platform-presets");
  const preset = getPreset(args.platformPreset ?? "youtube-video");
  const project = await createProject(db, {
    workspaceId: args.workspaceId, startType: "audio", inputText: a.transcript, platformPreset: preset.id,
    title: args.title?.trim() || a.transcript.split(/\s+/).slice(0, 6).join(" "),
    targetDurationSec: Math.min(preset.maxDurationSec, Math.max(5, Math.ceil(a.duration))), style: args.style,
  });
  await db.query(`update projects set kind=$2, quality=$3 where id=$1`,
    [project.id, PROJECT_KINDS.some(([k]) => k === args.kind) ? args.kind : "story", args.quality === "standard" ? "standard" : "draft"]);
  // New characters named in the text are created from what the text says about them (no picture yet).
  const { createCharacter } = await import("./characters");
  for (const c of a.characters.filter((x) => !x.id)) {
    const about = a.scenes.flatMap((sc) => sc.shots).filter((s) => s.characters.includes(c.name)).map((s) => s.text).slice(0, 3).join(" ");
    await createCharacter(db, args.workspaceId, { name: c.name, description: about });
  }
  await db.query(`update assets set project_id=coalesce(project_id,$2) where id=$1`, [a.audioAssetId, project.id]);
  const shots = a.scenes.flatMap((sc) => sc.shots.map((s, k) => ({ sc, s, k })));
  for (const [i, { sc, s, k }] of shots.entries()) {
    let preview: string | null = null, video: string | null = null;
    if (s.asset.kind === "clip" && s.asset.assetId) { video = s.asset.assetId; preview = await clipThumbnail(db, args.workspaceId, project.id, video); }
    else if (s.asset.assetId) preview = s.asset.assetId;
    const motion = s.asset.kind === "clip" ? "none" : ["zoom_in", "pan_left", "zoom_out", "pan_right"][i % 4];
    const [row] = await db.query<{ id: string }>(
      `insert into scenes(project_id, position, title, description, location, characters_text, narration, duration_sec, visual_prompt, mood,
         motion, preview_asset_id, video_asset_id, visual_source, motion_prompt, audio_asset_id, audio_trim_start, audio_trim_end)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) returning id`,
      [project.id, i + 1, `مشهد ${sc.index} · لقطة ${k + 1}`, s.visual, s.place ?? "", s.characters.join("، "), s.text,
       Math.max(0.5, round(s.end - s.start)), s.motionPrompt, s.expression ?? "", motion, preview, video, s.asset.kind, s.motionPrompt,
       a.audioAssetId, s.start, s.end >= a.duration ? null : s.end]);
    for (const [n, act] of s.actions.entries()) {
      await db.query(`insert into shots(scene_id, position, description, duration_sec) values ($1,$2,$3,$4)`,
        [row.id, n + 1, `${act.motion} (عند ${act.at.toFixed(1)} ث)`, Math.max(0.5, round((s.end - s.start) / s.actions.length))]);
    }
  }
  const { autoLinkCharacters } = await import("./scene-memory");
  await autoLinkCharacters(db, project.id);
  // Shots with no fitting asset get a free local placeholder picture, clearly marked as such.
  const { generatePreview } = await import("./studio");
  for (const s of await db.query<{ id: string }>(`select id from scenes where project_id=$1 and preview_asset_id is null`, [project.id])) {
    await generatePreview(db, s.id, false);
  }
  await db.query(`update projects set story=$2, updated_at=now() where id=$1`, [project.id, JSON.stringify(a)]);
  return project.id;
}

/** Manual choice of a shot's picture: a ready clip or an uploaded image from the library. */
export async function setSceneVisual(db: Db, sceneId: string, assetId: string | null) {
  const [s] = await db.query<{ project_id: string; workspace_id: string }>(
    `select s.project_id, p.workspace_id from scenes s join projects p on p.id=s.project_id where s.id=$1`, [sceneId]);
  if (!s) throw new Error("المشهد غير موجود");
  if (!assetId) {
    await db.query(`update scenes set video_asset_id=null, preview_asset_id=null, visual_source=null, updated_at=now() where id=$1`, [sceneId]);
    const { generatePreview } = await import("./studio");
    await generatePreview(db, sceneId, false);
    await db.query(`update scenes set visual_source='placeholder' where id=$1`, [sceneId]);
    return;
  }
  const a = await getAsset(db, assetId);
  if (!a || a.workspace_id !== s.workspace_id || (a.kind !== "image" && a.kind !== "video")) throw new Error("الملف غير صالح");
  if (a.kind === "video") {
    const thumb = await clipThumbnail(db, s.workspace_id, s.project_id, a.id);
    await db.query(`update scenes set video_asset_id=$2, preview_asset_id=$3, visual_source='clip', motion='none', updated_at=now() where id=$1`, [sceneId, a.id, thumb]);
  } else {
    await db.query(`update scenes set video_asset_id=null, preview_asset_id=$2, visual_source='image', updated_at=now() where id=$1`, [sceneId, a.id]);
  }
}
