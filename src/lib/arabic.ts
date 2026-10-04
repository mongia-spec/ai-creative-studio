/**
 * Arabic text matching for the character's knowledge search: normalization (diacritics,
 * alef/ya/ta-marbuta forms), stopwords and a light stemmer, so paraphrases still match
 * ("مم يُصنع الخبز؟" ≈ "ما مكونات صناعة الخبز").
 */
const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

export function normalizeArabic(s: string): string {
  return s
    .replace(DIACRITICS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set(
  normalizeArabic(`في من الى إلى على عن مع هذا هذه ذلك تلك هو هي هم هن انا أنا انت أنت انتم نحن ما ماذا لماذا كيف متى اين أين كم هل
    من مم لم لن لا نعم قد كان كانت يكون تكون التي الذي الذين اللذان و او أو ثم بل لكن إن ان أن كل بعض اي أي عند لدى حتى
    يا اذا إذا لو كما ايضا أيضا فقط جدا هنا هناك له لها لهم لك لي به بها بهم فيه فيها منه منها عنه عنها اخبرني أخبريني اخبريني قولي قل
    هيا ممكن اريد أريد ابغى ودي يعني شو وش ايش إيش ليش وين كيف شنو اللي الي`).split(" "),
);

const PREFIXES = ["وبال", "وال", "بال", "كال", "فال", "لل", "ال", "و", "ف", "ب", "ل", "ك", "س"];
const VERB_PREFIXES = ["ي", "ت", "ن", "ا"];
const SUFFIXES = ["كما", "هما", "تما", "ون", "ين", "ات", "ان", "ها", "هم", "هن", "كم", "كن", "نا", "تم", "وا", "يه", "ه", "ي", "ك", "ت"];

export function stem(word: string): string {
  let w = word;
  for (const p of PREFIXES) if (w.startsWith(p) && w.length - p.length >= 3) { w = w.slice(p.length); break; }
  for (const s of SUFFIXES) if (w.endsWith(s) && w.length - s.length >= 3) { w = w.slice(0, -s.length); break; }
  if (w.length >= 4 && VERB_PREFIXES.includes(w[0])) w = w.slice(1);
  return w;
}

/** Consonant skeleton: catches derived forms (صناعه / يصنع / مصنوع → صنع). */
export function skeleton(st: string): string {
  let w = st.replace(/[اوي]/g, "");
  if (w.length >= 4 && w[0] === "م") w = w.slice(1);
  return w.length >= 2 ? w : st;
}

export function tokens(text: string): string[] {
  return normalizeArabic(text).split(" ").filter((t) =>
    t.length > 1 && !STOPWORDS.has(t) && !(/^[وف]/.test(t) && STOPWORDS.has(t.slice(1))));
}

export function splitSentencesAr(text: string): string[] {
  return text.split(/(?<=[.!?؟…])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 1);
}

export interface Passage { id: string; entryId: string; title: string; text: string }

/**
 * BM25-lite over sentence passages, matching on stems (weight 1) and skeletons (0.5).
 * Returns passages that share at least one meaningful term with the question.
 */
export function rankPassages(question: string, passages: Passage[], extraContext = "") {
  const q = [...new Set(tokens(question + " " + extraContext).map(stem))];
  if (!q.length || !passages.length) return { terms: q, results: [] as (Passage & { score: number; matched: number })[] };
  const docs = passages.map((p) => {
    const st = tokens(p.title + " " + p.text).map(stem);
    return { p, stems: st, skel: st.map(skeleton) };
  });
  const N = docs.length;
  const avg = docs.reduce((a, d) => a + d.stems.length, 0) / N || 1;
  const df = (term: string, sk: boolean) => docs.filter((d) => (sk ? d.skel : d.stems).includes(term)).length;
  const k1 = 1.2, b = 0.75;
  const results = docs.map((d) => {
    let score = 0, matched = 0;
    for (const t of q) {
      let tf = d.stems.filter((x) => x === t).length, w = 1, n = df(t, false);
      if (!tf) {
        const sk = skeleton(t);
        if (sk.length >= 3) { tf = d.skel.filter((x) => x === sk).length; w = 0.5; n = df(sk, true); }
      }
      if (!tf) continue;
      matched++;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += w * idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * d.stems.length) / avg)));
    }
    return { ...d.p, score, matched };
  }).filter((r) => r.matched > 0).sort((a, b2) => b2.score - a.score);
  return { terms: q, results };
}
