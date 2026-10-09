import { normalizeArabic } from "./arabic";

/**
 * Safe responses for characters that talk to viewers (often children). A small, conservative
 * keyword screen runs before any answer; sensitive topics get a kind, fixed reply that points
 * to a trusted adult, and the character never asks for or shares personal information.
 * This is a first layer, not a guarantee: a real deployment should add a moderation provider.
 */
const RULES: { topic: string; words: string[]; reply: string }[] = [
  {
    topic: "harm",
    words: ["انتحار", "اقتل نفسي", "اموت", "اذي نفسي", "جرح نفسي", "suicide", "kill myself"],
    reply: "يهمّني أن تكون بخير. تحدّث الآن مع شخص كبير تثق به، مثل أحد والديك أو معلمك. لست وحدك.",
  },
  {
    topic: "violence",
    words: ["سلاح", "مسدس", "قنبله", "متفجرات", "كيف اقتل", "كيف اضرب", "weapon", "bomb"],
    reply: "هذا موضوع لا أتحدث عنه. لنعد إلى درسنا، ماذا تحب أن تعرف؟",
  },
  {
    topic: "adult",
    words: ["جنس", "اباحي", "عاري", "sex", "porn"],
    reply: "هذا سؤال لا أجيب عنه هنا. اسأل عنه شخصًا كبيرًا تثق به. لنعد إلى قصتنا.",
  },
  {
    topic: "personal",
    words: ["رقم هاتفك", "رقمك", "عنوانك", "اين تسكنين", "وين ساكنه", "كلمه السر", "باسورد", "password", "رقم بطاقه"],
    reply: "لا نتبادل الأرقام أو العناوين أو كلمات السر هنا، فهي معلومات خاصة. احتفظ بمعلوماتك لنفسك دائمًا.",
  },
  {
    topic: "insult",
    words: ["غبي", "غبيه", "حمار", "تافه", "اكرهك", "stupid"],
    reply: "أحب أن نتحدث بلطف. ما رأيك أن تسألني عن شيء في الدرس؟",
  },
];

export function screenQuestion(question: string): { topic: string; reply: string } | null {
  const n = ` ${normalizeArabic(question)} `;
  for (const r of RULES) {
    if (r.words.some((w) => n.includes(` ${normalizeArabic(w)}`))) return { topic: r.topic, reply: r.reply };
  }
  return null;
}
