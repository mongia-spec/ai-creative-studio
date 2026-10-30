/**
 * Visual style library. One entry drives three things:
 * - `prompt`/`negative`: sent to real image/video providers (English works best for them).
 * - `palette`: colours for mock previews and the style card swatch.
 * - `look`: a local FFmpeg filter that gives the free draft export an approximate feel of the style.
 *   It is only a filter over existing pictures, not a redraw in that style (that needs a provider).
 */
export interface VisualStyle {
  id: string;
  label: string;
  emoji: string;
  group: "basic" | "art" | "lesson";
  description: string;
  prompt: string;
  negative: string;
  palette: [string, string, string];
  /** FFmpeg filter chain (no leading comma), applied to the full-size frame. Empty = no local look. */
  look: string;
}

export const STYLE_GROUPS: Record<VisualStyle["group"], string> = {
  basic: "أساسية",
  art: "فنية",
  lesson: "للدروس والشرح",
};

// Maps a grey level (0-255) to a two-colour ramp: dark -> light.
const tint = (dark: [number, number, number], light: [number, number, number]) =>
  `format=rgb24,lutrgb=r='${dark[0]}+val*${((light[0] - dark[0]) / 255).toFixed(3)}':g='${dark[1]}+val*${((light[1] - dark[1]) / 255).toFixed(3)}':b='${dark[2]}+val*${((light[2] - dark[2]) / 255).toFixed(3)}'`;

export const VISUAL_STYLES: VisualStyle[] = [
  {
    id: "cinematic", label: "سينمائي", emoji: "🎬", group: "basic",
    description: "إضاءة درامية وعمق ميدان، مثل لقطات الأفلام.",
    prompt: "cinematic film still, dramatic lighting, shallow depth of field, rich color grading",
    negative: "flat lighting, cartoon, text",
    palette: ["#1f2a44", "#c98a3c", "#e8d5b0"],
    look: "eq=contrast=1.08:saturation=0.95,vignette=PI/5",
  },
  {
    id: "cartoon", label: "كرتوني", emoji: "🧸", group: "basic",
    description: "ألوان زاهية وخطوط واضحة، قريب من رسوم الأطفال المتحركة.",
    prompt: "2D cartoon illustration for children, bold clean outlines, bright friendly colors, simple shapes",
    negative: "photorealistic, dark, scary, text",
    palette: ["#ff9f1c", "#2ec4b6", "#ffffff"],
    look: "eq=saturation=1.4:contrast=1.1",
  },
  {
    id: "realistic", label: "واقعي", emoji: "📷", group: "basic",
    description: "صور طبيعية كأنها مصوّرة بالكاميرا.",
    prompt: "photorealistic, natural light, true-to-life colors",
    negative: "cartoon, painting, text",
    palette: ["#5b6b4f", "#b9a68a", "#f1ece2"],
    look: "",
  },
  {
    id: "documentary", label: "وثائقي", emoji: "🎞️", group: "basic",
    description: "ألوان هادئة وحبيبات خفيفة، يناسب القصص الحقيقية والتاريخ.",
    prompt: "documentary photography, muted natural tones, subtle film grain, observational framing",
    negative: "fantasy, cartoon, text",
    palette: ["#3d3a35", "#8c7f6a", "#d9d0bf"],
    look: "eq=saturation=0.75:contrast=1.05,noise=alls=7:allf=t",
  },
  {
    id: "watercolor", label: "ألوان مائية", emoji: "🎨", group: "art",
    description: "حواف ناعمة وألوان شفافة على ورق، دافئ ومناسب للقصص.",
    prompt: "soft watercolor painting on textured paper, gentle color bleeds, light washes, storybook feel",
    negative: "hard edges, photorealistic, text",
    palette: ["#7fb7be", "#f3c6a5", "#fbf6ec"],
    look: "gblur=sigma=1.6,eq=saturation=0.85:brightness=0.04:contrast=0.92",
  },
  {
    id: "clay", label: "صلصال", emoji: "🟠", group: "art",
    description: "شخصيات وأماكن كأنها من الصلصال، ممتعة للصغار.",
    prompt: "claymation stop-motion style, plasticine characters and sets, soft studio lighting, handmade texture",
    negative: "photorealistic, flat 2D, text",
    palette: ["#e76f51", "#f4a261", "#2a9d8f"],
    look: "gblur=sigma=2.6,eq=saturation=1.45:contrast=1.2:brightness=0.03,unsharp=5:5:0.8",
  },
  {
    id: "paper-cut", label: "قصاصات ورق", emoji: "✂️", group: "art",
    description: "طبقات ورق ملوّن مقصوص بألوان قليلة واضحة.",
    prompt: "layered paper cut-out art, flat color shapes, subtle drop shadows between layers, craft paper texture",
    negative: "photorealistic, gradients, text",
    palette: ["#264653", "#e9c46a", "#f4f1de"],
    look: "gblur=sigma=3,format=yuv444p,lut=y='floor(val/42)*42+21':u='floor(val/16)*16+8':v='floor(val/16)*16+8',eq=saturation=1.15",
  },
  {
    id: "shadow-puppet", label: "خيال الظل", emoji: "🏮", group: "art",
    description: "ظلال سوداء على ستارة مضيئة دافئة، من تراثنا.",
    prompt: "traditional shadow puppet theater, black silhouettes against a warm glowing backlit screen",
    negative: "color details on characters, photorealistic, text",
    palette: ["#140c06", "#d9822b", "#ffd08a"],
    look: `format=gray,gblur=sigma=1.5,eq=contrast=1.9:brightness=-0.06,${tint([20, 12, 6], [255, 190, 110])}`,
  },
  {
    id: "pixel", label: "بكسل", emoji: "👾", group: "art",
    description: "مربعات كبيرة مثل ألعاب الفيديو القديمة.",
    prompt: "retro 16-bit pixel art, limited palette, crisp pixels",
    negative: "smooth gradients, photorealistic, text",
    palette: ["#3a2e5c", "#5fcde4", "#fbf236"],
    look: "PIXELATE",
  },
  {
    id: "chalkboard", label: "طباشير على السبورة", emoji: "🧑‍🏫", group: "lesson",
    description: "خطوط بيضاء على سبورة خضراء، مثالي لشرح الدروس.",
    prompt: "white chalk drawing on a dark green school chalkboard, hand-drawn lines, chalk dust texture",
    negative: "color photo, photorealistic, text",
    palette: ["#1e3b2f", "#f5f5f0", "#8fb8a0"],
    look: `format=gray,edgedetect=low=0.06:high=0.2,dilation,${tint([30, 59, 47], [245, 245, 240])}`,
  },
  {
    id: "sketch", label: "رسم يدوي", emoji: "✏️", group: "lesson",
    description: "خطوط قلم رصاص على ورق بيج، بسيط وواضح.",
    prompt: "hand-drawn pencil sketch on beige paper, loose expressive lines, light hatching",
    negative: "color, photorealistic, text",
    palette: ["#f2e8d5", "#5a5146", "#a99b86"],
    look: `format=gray,edgedetect=low=0.08:high=0.25,dilation,negate,${tint([70, 62, 52], [242, 232, 213])}`,
  },
  {
    id: "sand", label: "رسم بالرمل", emoji: "⏳", group: "lesson",
    description: "رسوم رمل على لوح مضيء، هادئة وساحرة للحكايات.",
    prompt: "sand animation art on a backlit light table, grainy sand textures, warm amber glow",
    negative: "color photo, sharp digital lines, text",
    palette: ["#5c3d1e", "#e0b872", "#fff3d6"],
    look: `format=gray,gblur=sigma=1.4,noise=alls=10:allf=t,${tint([70, 45, 20], [255, 236, 196])}`,
  },
];

export function getStyle(id: string | null | undefined): VisualStyle {
  return VISUAL_STYLES.find((s) => s.id === id) ?? VISUAL_STYLES[0];
}

/** Style text sent to real providers in place of the bare id. */
export function stylePrompt(id: string | null | undefined): string {
  return getStyle(id).prompt;
}

/** Local FFmpeg look for a frame of the given size (leading comma included), or "" for none. */
export function styleLook(id: string | null | undefined, size: { width: number; height: number }): string {
  const look = getStyle(id).look;
  if (!look) return "";
  if (look === "PIXELATE") {
    const w = Math.max(16, Math.round(size.width / 8)), h = Math.max(16, Math.round(size.height / 8));
    return `,scale=${w}:${h}:flags=area,scale=${size.width}:${size.height}:flags=neighbor`;
  }
  return `,${look}`;
}

/** Card data for pickers (client-safe). */
export const STYLE_OPTIONS = VISUAL_STYLES.map(({ id, label, emoji, group, description, palette, look }) => ({
  id, label, emoji, group, description, palette, hasLook: !!look,
}));
export type StyleOption = (typeof STYLE_OPTIONS)[number];
