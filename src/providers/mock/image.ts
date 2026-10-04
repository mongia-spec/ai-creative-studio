import type { ImageProvider } from "../types";

/** Mock image provider: returns a labelled SVG placeholder in the requested size. No cost. */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function esc(s: string) {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function placeholderSvg(opts: { width: number; height: number; label: string; prompt: string; seed: string }) {
  const h = hash(opts.seed);
  const hue1 = h % 360;
  const hue2 = (hue1 + 40 + (h % 80)) % 360;
  const { width: w, height: hgt } = opts;
  const fs = Math.round(Math.min(w, hgt) / 12);
  const prompt = opts.prompt.length > 90 ? opts.prompt.slice(0, 90) + "…" : opts.prompt;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hgt}" viewBox="0 0 ${w} ${hgt}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl(${hue1},45%,35%)"/><stop offset="1" stop-color="hsl(${hue2},50%,22%)"/></linearGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/>
<text x="50%" y="42%" text-anchor="middle" direction="rtl" font-family="sans-serif" font-size="${fs}" fill="#fff" font-weight="700">${esc(opts.label)}</text>
<text x="50%" y="54%" text-anchor="middle" direction="rtl" font-family="sans-serif" font-size="${Math.round(fs / 2.6)}" fill="#ffffffcc">${esc(prompt)}</text>
<text x="50%" y="92%" text-anchor="middle" direction="rtl" font-family="sans-serif" font-size="${Math.round(fs / 2.4)}" fill="#ffffff99">معاينة وهمية — دون مزوّد</text>
</svg>`;
}

export const mockImageProvider: ImageProvider = {
  info: {
    id: "mock-image", name: "Mock Image", capability: "image", isMock: true,
    languages: ["ar", "en"], dialects: [], tiers: ["draft", "standard", "pro", "cinematic"],
    pricing: { unitType: "images", unitPriceUsd: 0 },
    support: {
      referenceImages: { level: "simulated", note: "يستقبل الصور المرجعية ويحفظها مع المهمة، لكنه يرسم صورة مؤقتة لا وجهًا." },
      identityConsistency: { level: "simulated", note: "نفس الهوية تعطي نفس المعاينة، وتغييرها يعيد التوليد. لا يرسم الشخصية فعلًا." },
    },
  },
  async generateImage(req) {
    const svg = placeholderSvg({ width: req.width, height: req.height, label: req.label ?? "", prompt: req.prompt, seed: req.seed ?? req.prompt });
    return {
      result: { bytes: new TextEncoder().encode(svg), mimeType: "image/svg+xml", width: req.width, height: req.height },
      usage: { units: 1, unitType: "images", model: "placeholder-svg" },
    };
  },
};
