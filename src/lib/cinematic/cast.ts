/**
 * Built-in fixed cast for the cinematic engine. Each character is drawn ONCE here, so it looks
 * identical in every video. Animated parts carry ids the engine drives per frame:
 *   .eyes (blink) · .mouth (opens with the voice) · .arm-wave (waving) · .antenna-glow (pulse)
 * When the owner uploads a real reference picture for a character, the engine uses that picture
 * instead (shown whole, never cropped) and these drawings stay as a fallback.
 */

export interface BuiltinCharacter {
  id: string;
  name: string;
  /** SVG markup drawn in a 400×720 box, feet at the bottom edge. */
  svg: string;
  /** One-line identity note, reused in image/video prompts so AI providers keep the same look. */
  identity: string;
}

const SKIN = "#F3C6A0";
const SKIN_SHADE = "#E2A97F";
const UNIFORM = "#22A699"; // مدرسة الأصحاب: فيروزي
const UNIFORM_DARK = "#17796F";
const COLLAR = "#FFC93C"; // أصفر الصداقة
const METAL = "#C9D3DA";

/** School badge: two stars holding hands (شعار مدرسة الأصحاب). */
function badge(x: number, y: number, s = 1): string {
  const star = (cx: number, cy: number, fill: string) => {
    const pts: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 11 : 5;
      const a = (Math.PI / 5) * i - Math.PI / 2;
      pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
    }
    return `<polygon points="${pts.join(" ")}" fill="${fill}" stroke="#fff" stroke-width="1.5"/>`;
  };
  return `<g transform="translate(${x},${y}) scale(${s})">
    <circle r="22" fill="#fff" opacity=".95"/>
    ${star(-8, -2, "#FFC93C")}${star(8, -2, "#FF8A5B")}
    <path d="M-2,3 Q0,7 2,3" stroke="#7A4B2A" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  </g>`;
}

function face(opts: { hair: string; extra?: string; antennaTip: string }): string {
  return `
  <g class="head" transform="translate(200,215)">
    <!-- robot ear discs -->
    <circle cx="-112" cy="0" r="26" fill="${METAL}" stroke="#93A3AE" stroke-width="4"/>
    <circle cx="-112" cy="0" r="12" fill="#5FE3D1" class="ear-led"/>
    <circle cx="112" cy="0" r="26" fill="${METAL}" stroke="#93A3AE" stroke-width="4"/>
    <circle cx="112" cy="0" r="12" fill="#5FE3D1" class="ear-led"/>
    <!-- face -->
    <ellipse cx="0" cy="0" rx="104" ry="112" fill="${SKIN}"/>
    <ellipse cx="0" cy="40" rx="96" ry="70" fill="${SKIN_SHADE}" opacity=".18"/>
    ${opts.hair}
    <!-- antenna (drawn over the hair) -->
    <line x1="0" y1="-112" x2="0" y2="-160" stroke="${METAL}" stroke-width="8" stroke-linecap="round"/>
    <circle cx="0" cy="-112" r="12" fill="${METAL}"/>
    <g class="antenna-glow" transform="translate(0,-168)">${opts.antennaTip}</g>
    <!-- eyes -->
    <g class="eyes">
      <g transform="translate(-40,4)"><ellipse rx="25" ry="30" fill="#fff"/><circle cx="3" cy="4" r="16" fill="#3A2A20"/><circle cx="3" cy="4" r="8" fill="#120C08"/><circle cx="9" cy="-4" r="6" fill="#fff"/></g>
      <g transform="translate(40,4)"><ellipse rx="25" ry="30" fill="#fff"/><circle cx="-3" cy="4" r="16" fill="#3A2A20"/><circle cx="-3" cy="4" r="8" fill="#120C08"/><circle cx="3" cy="-4" r="6" fill="#fff"/></g>
    </g>
    <path d="M-62,-34 Q-40,-46 -18,-36" stroke="#5A3A26" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M62,-34 Q40,-46 18,-36" stroke="#5A3A26" stroke-width="6" fill="none" stroke-linecap="round"/>
    <ellipse cx="-66" cy="44" rx="17" ry="10" fill="#FF8A80" opacity=".55"/>
    <ellipse cx="66" cy="44" rx="17" ry="10" fill="#FF8A80" opacity=".55"/>
    <!-- mouth: engine sets data-open 0..1 -->
    <g class="mouth" transform="translate(0,60)">
      <path class="mouth-closed" d="M-24,0 Q0,18 24,0" stroke="#8C3B2E" stroke-width="6" fill="none" stroke-linecap="round"/>
      <g class="mouth-open" opacity="0"><ellipse class="mouth-shape" rx="20" ry="14" fill="#7A2420"/><ellipse cx="0" cy="7" rx="11" ry="5" fill="#E86B6B"/></g>
    </g>
    ${opts.extra ?? ""}
  </g>`;
}

const boyHair = `
  <path d="M-104,-20 C-110,-100 -40,-140 10,-128 C70,-130 112,-90 104,-22 C90,-58 60,-78 30,-70 C10,-92 -30,-90 -50,-70 C-70,-72 -96,-50 -104,-20Z" fill="#3B2416"/>
  <path d="M-10,-126 C0,-150 22,-150 28,-132" fill="#3B2416"/>`;

const girlHair = `
  <path d="M-118,40 C-136,-20 -120,-110 -40,-130 C30,-146 118,-110 120,-20 C126,30 116,60 104,74 C110,30 96,-6 84,-30
           C60,-60 20,-74 -10,-66 C-40,-80 -80,-50 -92,-20 C-104,10 -104,46 -96,74 C-110,66 -116,54 -118,40Z" fill="#5A3320"/>
  <path d="M-118,40 q-10,24 6,40 q-16,6 -6,24" stroke="#5A3320" stroke-width="14" fill="none" stroke-linecap="round"/>
  <path d="M118,40 q10,24 -6,40 q16,6 6,24" stroke="#5A3320" stroke-width="14" fill="none" stroke-linecap="round"/>
  <path d="M-60,-96 q20,-14 40,-4 q20,-14 44,-2" stroke="#7A4A30" stroke-width="5" fill="none" opacity=".6"/>
  <g transform="translate(70,-86) rotate(18)"><polygon points="0,-14 4,-4 15,-4 6,3 9,14 0,7 -9,14 -6,3 -15,-4 -4,-4" fill="#FFC93C" stroke="#fff" stroke-width="2"/></g>`;

const ballTip = `<circle r="16" fill="#FFC93C"/><circle r="26" fill="#FFC93C" opacity=".25"/><circle cx="-5" cy="-5" r="5" fill="#fff" opacity=".8"/>`;
const heartTip = `<path d="M0,12 C-22,-2 -16,-22 0,-12 C16,-22 22,-2 0,12Z" fill="#FF7FA8" stroke="#fff" stroke-width="2"/><circle r="26" fill="#FF7FA8" opacity=".22"/>`;

function body(kind: "boy" | "girl"): string {
  const legs =
    kind === "boy"
      ? `<rect x="150" y="520" width="42" height="140" rx="16" fill="#26355D"/><rect x="208" y="520" width="42" height="140" rx="16" fill="#26355D"/>`
      : `<rect x="160" y="560" width="30" height="100" rx="12" fill="${SKIN}"/><rect x="210" y="560" width="30" height="100" rx="12" fill="${SKIN}"/>
         <rect x="156" y="600" width="38" height="52" rx="10" fill="#fff"/><rect x="206" y="600" width="38" height="52" rx="10" fill="#fff"/>`;
  const shoes = `<ellipse cx="166" cy="668" rx="38" ry="18" fill="#1E2A44"/><ellipse cx="234" cy="668" rx="38" ry="18" fill="#1E2A44"/>
    <rect x="132" y="662" width="64" height="8" rx="4" fill="#fff" opacity=".85"/><rect x="204" y="662" width="64" height="8" rx="4" fill="#fff" opacity=".85"/>`;
  const torso =
    kind === "boy"
      ? `<path d="M118,560 C110,450 120,360 200,350 C280,360 290,450 282,560Z" fill="${UNIFORM}"/>
         <path d="M118,560 C116,520 120,480 126,450 L140,560Z" fill="${UNIFORM_DARK}" opacity=".5"/>`
      : `<path d="M100,600 C120,470 130,370 200,350 C270,370 280,470 300,600Z" fill="${UNIFORM}"/>
         <path d="M100,600 L300,600 L292,580 L108,580Z" fill="${UNIFORM_DARK}"/>`;
  const collar = `<path d="M160,352 L200,392 L240,352 L226,346 L200,372 L174,346Z" fill="${COLLAR}"/>
    <rect x="194" y="392" width="12" height="${kind === "boy" ? 150 : 170}" rx="6" fill="${UNIFORM_DARK}" opacity=".35"/>`;
  const armL = `<g class="arm-rest"><path d="M128,380 C96,420 92,480 104,520" stroke="${UNIFORM}" stroke-width="44" fill="none" stroke-linecap="round"/>
    <circle cx="106" cy="530" r="22" fill="${SKIN}"/></g>`;
  const armR = `<g class="arm-wave" style="transform-origin:272px 384px">
    <path d="M272,380 C304,420 308,480 296,520" stroke="${UNIFORM}" stroke-width="44" fill="none" stroke-linecap="round"/>
    <circle cx="294" cy="530" r="22" fill="${SKIN}"/></g>`;
  return `${legs}${shoes}${armL}${torso}${collar}${badge(244, 440, 0.9)}${armR}
    <rect x="186" y="318" width="28" height="40" rx="10" fill="${SKIN_SHADE}"/>`;
}

export const BUILTIN_CAST: Record<string, BuiltinCharacter> = {
  shtshout: {
    id: "shtshout",
    name: "شتشوت",
    identity:
      "Shtshout: a friendly robot who looks like a 7-year-old human boy, round face, big brown eyes, short dark-brown hair, silver robot ear discs with glowing teal LEDs, a short antenna with a glowing yellow ball; wears the Al-Ashab school uniform: turquoise shirt, sunny-yellow collar, navy trousers, badge of two stars holding hands.",
    svg: `<svg viewBox="0 0 400 720" xmlns="http://www.w3.org/2000/svg">${body("boy")}${face({ hair: boyHair, antennaTip: ballTip })}</svg>`,
  },
  shtshouta: {
    id: "shtshouta",
    name: "شتشوتة",
    identity:
      "Shtshouta: Shtshout's little sister, a cute robot who looks like a 6-year-old human girl, short wavy brown bob hair with a yellow star clip, big brown eyes, silver robot ear discs with glowing teal LEDs, a short antenna with a pink heart tip; wears the Al-Ashab school uniform: turquoise pinafore dress, sunny-yellow collar, white socks, badge of two stars holding hands.",
    svg: `<svg viewBox="0 0 400 720" xmlns="http://www.w3.org/2000/svg">${body("girl")}${face({ hair: girlHair, antennaTip: heartTip })}</svg>`,
  },
};
