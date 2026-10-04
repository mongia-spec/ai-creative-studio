import type { DraftScene, ScriptDraft, ScriptRequest, TextProvider } from "../types";

/**
 * Deterministic mock LLM: same input → same script. No network, no cost.
 * It structures the user's own words; it does not invent knowledge.
 */
const CAMERAS = ["لقطة واسعة تأسيسية", "لقطة متوسطة", "لقطة قريبة", "حركة كاميرا بطيئة للأمام", "لقطة من فوق الكتف", "لقطة جانبية متتبعة"];
const LIGHTING: Record<string, string> = {
  cinematic: "إضاءة سينمائية دافئة بظلال ناعمة",
  cartoon: "إضاءة ساطعة وألوان مشبعة",
  realistic: "إضاءة طبيعية",
  watercolor: "إضاءة ناعمة بألوان باهتة",
  documentary: "إضاءة طبيعية واقعية",
};
const IDEA_BEATS = [
  { title: "الافتتاحية", mood: "هادئ ومشوّق" },
  { title: "التمهيد", mood: "فضول" },
  { title: "الاكتشاف", mood: "دهشة" },
  { title: "التحدي", mood: "توتر" },
  { title: "الذروة", mood: "حماس" },
  { title: "الحل", mood: "ارتياح" },
  { title: "الخاتمة", mood: "دافئ ومُلهم" },
];

const WORDS_PER_SEC = 2.2; // rough Arabic narration pace, used only for duration estimates

export function splitSentences(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/(?<=[.!?؟…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function words(s: string) {
  return s.split(/\s+/).filter(Boolean).length;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function shortTitle(input: string) {
  const w = input.trim().split(/\s+/).slice(0, 6).join(" ");
  return w.replace(/[.!?؟،,:]+$/, "");
}

function makeScene(i: number, base: Partial<DraftScene> & { title: string; narration: string; durationSec: number }, req: ScriptRequest): DraftScene {
  const camera = CAMERAS[i % CAMERAS.length];
  const lighting = LIGHTING[req.style] ?? LIGHTING.cinematic;
  const half = Math.max(1, Math.round(base.durationSec / 2));
  return {
    description: base.narration,
    location: "",
    characters: "",
    dialogue: "",
    mood: "",
    audioNotes: "موسيقى خلفية هادئة",
    ...base,
    camera,
    lighting,
    visualPrompt: `${base.narration} — ${camera}، ${lighting}، أسلوب ${req.style}، نسبة ${req.aspectRatio}`,
    shots: [
      { description: `تأسيس: ${base.title}`, camera, durationSec: half },
      { description: `تفصيل: ${base.title}`, camera: CAMERAS[(i + 2) % CAMERAS.length], durationSec: Math.max(1, base.durationSec - half) },
    ],
  };
}

function fromIdea(req: ScriptRequest): ScriptDraft {
  const idea = req.input.trim();
  const count = clamp(Math.round(req.targetDurationSec / 6), 3, IDEA_BEATS.length);
  // Always keep opening and ending; take middle beats in order.
  const middle = IDEA_BEATS.slice(1, -1).slice(0, count - 2);
  const beats = [IDEA_BEATS[0], ...middle, IDEA_BEATS[IDEA_BEATS.length - 1]];
  const per = Math.max(2, Math.round(req.targetDurationSec / beats.length));
  const scenes = beats.map((b, i) =>
    makeScene(i, { title: b.title, mood: b.mood, narration: `${b.title}: ${idea}`, durationSec: per }, req),
  );
  const title = shortTitle(idea);
  return {
    title,
    logline: idea,
    body: scenes.map((s, i) => `المشهد ${i + 1} — ${s.title}\n${s.narration}`).join("\n\n"),
    scenes,
  };
}

function fromText(req: ScriptRequest): ScriptDraft {
  const sentences = splitSentences(req.input);
  const maxScenes = 12;
  const perScene = Math.max(1, Math.ceil(sentences.length / maxScenes));
  const chunks: string[] = [];
  for (let i = 0; i < sentences.length; i += perScene) chunks.push(sentences.slice(i, i + perScene).join(" "));
  const scenes = chunks.map((chunk, i) =>
    makeScene(i, { title: `المشهد ${i + 1}`, narration: chunk, durationSec: clamp(Math.round(words(chunk) / WORDS_PER_SEC), 3, 20) }, req),
  );
  return {
    title: shortTitle(sentences[0] ?? "مشروع جديد"),
    logline: sentences[0] ?? "",
    body: req.input.trim(),
    scenes,
  };
}

export const mockTextProvider: TextProvider = {
  info: {
    id: "mock-text", name: "Mock LLM", capability: "text", isMock: true,
    languages: ["ar", "en"], dialects: [], tiers: ["draft", "standard", "pro", "cinematic"],
    pricing: { unitType: "characters", unitPriceUsd: 0 },
  },
  async generateScript(req) {
    if (!req.input.trim()) throw new Error("النص المدخل فارغ");
    const result = req.startType === "idea" ? fromIdea(req) : fromText(req);
    return { result, usage: { units: req.input.length, unitType: "characters", model: "mock-1" } };
  },
};
