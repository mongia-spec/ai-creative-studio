/**
 * Built-in sets (backgrounds), drawn in the engine's palette. Each set has a back layer (walls,
 * window, light) and a front layer (foreground objects) so the camera gets real depth/parallax.
 * Sizes are for a 1080×1920 portrait stage; the engine scales them for other formats.
 */
export interface SetDef {
  back: string;
  front: string;
  /** Where the sunlight comes from (stage px), used for god rays. */
  light: { x: number; y: number };
}

const W = 1080;
const H = 1920;

/** Back of a seated student with a raised hand (no face — keeps focus on the cast). */
function studentBack(x: number, y: number, hair: string, shirt: string, raised = false, scarf = false): string {
  const hand = raised
    ? `<path d="M${x + 70},${y - 10} C${x + 90},${y - 120} ${x + 96},${y - 190} ${x + 92},${y - 250}" stroke="${shirt}" stroke-width="46" fill="none" stroke-linecap="round"/>
       <circle cx="${x + 92}" cy="${y - 262}" r="26" fill="#E8B48C"/>`
    : "";
  const head = scarf
    ? `<ellipse cx="${x}" cy="${y - 80}" rx="78" ry="86" fill="#F5F0E6"/><path d="M${x - 80},${y - 60} Q${x},${y + 10} ${x + 80},${y - 60} L${x + 90},${y} L${x - 90},${y}Z" fill="#EDE6D8"/>`
    : `<ellipse cx="${x}" cy="${y - 80}" rx="74" ry="82" fill="${hair}"/>`;
  return `<g class="student">${hand}
    <path d="M${x - 120},${y + 220} C${x - 120},${y + 40} ${x - 80},${y - 10} ${x},${y - 10} C${x + 80},${y - 10} ${x + 120},${y + 40} ${x + 120},${y + 220}Z" fill="${shirt}"/>
    ${head}</g>`;
}

export const SETS: Record<string, SetDef> = {
  classroom: {
    light: { x: 900, y: 420 },
    back: `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6E7CF"/><stop offset="1" stop-color="#EBD3AE"/></linearGradient>
        <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C99B6B"/><stop offset="1" stop-color="#A9784B"/></linearGradient>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD58A"/><stop offset="1" stop-color="#FFB46B"/></linearGradient>
        <radialGradient id="sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFF6D8"/><stop offset="1" stop-color="#FFF6D8" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#wall)"/>
      <rect y="1260" width="${W}" height="${H - 1260}" fill="url(#floor)"/>
      <rect y="1240" width="${W}" height="26" fill="#8A5D3B"/>
      <!-- window (right) -->
      <g transform="translate(760,250)">
        <rect width="300" height="420" rx="18" fill="#7A5236"/>
        <rect x="18" y="18" width="264" height="384" rx="8" fill="url(#sky)"/>
        <circle cx="200" cy="150" r="110" fill="url(#sun)"/>
        <path d="M18,330 Q90,280 160,320 T282,300 L282,402 L18,402Z" fill="#7FBF7A" opacity=".85"/>
        <path d="M30,402 L30,300 M70,402 L70,290" stroke="#5B8C4E" stroke-width="10"/>
        <circle cx="50" cy="280" r="38" fill="#4E8F52"/>
        <rect x="146" y="18" width="10" height="384" fill="#7A5236"/><rect x="18" y="206" width="264" height="10" fill="#7A5236"/>
      </g>
      <!-- chalkboard (dark green) -->
      <g transform="translate(70,300)">
        <rect width="620" height="380" rx="16" fill="#6E4A2E"/>
        <rect x="16" y="16" width="588" height="348" rx="8" fill="#1E5631"/>
        <text x="310" y="150" font-family="Lalezar, Cairo" font-size="92" fill="#F4F1E8" text-anchor="middle" direction="rtl">كلمةٌ سحريّة</text>
        <text x="310" y="250" font-family="Cairo" font-weight="700" font-size="54" fill="#FFE29A" text-anchor="middle" direction="rtl">✨ ؟ ✨</text>
        <rect x="40" y="350" width="80" height="14" rx="4" fill="#fff" opacity=".9"/>
      </g>
      <!-- reinforcement board (stars chart) -->
      <g transform="translate(90,760)">
        <rect width="380" height="300" rx="16" fill="#FFFFFF" stroke="#22A699" stroke-width="10"/>
        <text x="190" y="62" font-family="Cairo" font-weight="800" font-size="40" fill="#17796F" text-anchor="middle" direction="rtl">نجوم الأصحاب</text>
        ${[0, 1, 2, 3]
          .map(
            (r) =>
              `<rect x="30" y="${90 + r * 50}" width="320" height="36" rx="10" fill="${["#E3F6F3", "#FFF4D6", "#E3F6F3", "#FFF4D6"][r]}"/>` +
              Array.from({ length: r + 2 }, (_, i) => `<text x="${320 - i * 44}" y="${118 + r * 50}" font-size="28" text-anchor="middle">⭐</text>`).join(""),
          )
          .join("")}
      </g>
      <!-- charity box (inspired, not copied) -->
      <g transform="translate(760,760) scale(.85)">
        <rect width="170" height="180" rx="14" fill="#22A699"/>
        <rect x="45" y="22" width="80" height="12" rx="6" fill="#0F4F48"/>
        <text x="85" y="110" font-family="Cairo" font-weight="800" font-size="30" fill="#fff" text-anchor="middle" direction="rtl">صندوق</text>
        <text x="85" y="148" font-family="Cairo" font-weight="800" font-size="30" fill="#FFE29A" text-anchor="middle" direction="rtl">الخير</text>
      </g>
      <!-- school name banner -->
      <g transform="translate(540,150)">
        <rect x="-300" y="-56" width="600" height="96" rx="48" fill="#22A699"/>
        <text y="12" font-family="Lalezar, Cairo" font-size="62" fill="#fff" text-anchor="middle" direction="rtl">مدرسة الأصحاب</text>
      </g>
      <!-- plant -->
      <g transform="translate(960,1090)"><rect x="-50" y="80" width="100" height="110" rx="14" fill="#C8643B"/>
        <ellipse cx="-30" cy="40" rx="40" ry="80" fill="#4E8F52" transform="rotate(-20)"/><ellipse cx="30" cy="30" rx="40" ry="90" fill="#5FA463" transform="rotate(18)"/></g>
    </svg>`,
    front: `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      ${studentBack(170, 1600, "#2B1C14", "#F5F5F5", false, true)}
      ${studentBack(900, 1640, "#3A2618", "#22A699", true)}
      <rect x="-40" y="1720" width="1160" height="60" rx="18" fill="#B98552"/>
      <rect x="-40" y="1770" width="1160" height="200" fill="#9C6B3E"/>
    </svg>`,
  },
  orchard: {
    light: { x: 820, y: 300 },
    back: `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <defs><linearGradient id="osky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFCF86"/><stop offset=".6" stop-color="#FFE7B8"/><stop offset="1" stop-color="#CFE3A4"/></linearGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#osky)"/>
      <circle cx="820" cy="300" r="120" fill="#FFF3CF"/>
      <path d="M0,1100 Q300,980 600,1060 T1080,1020 L1080,1920 L0,1920Z" fill="#9CC46E"/>
      <path d="M0,1250 Q400,1150 1080,1240 L1080,1920 L0,1920Z" fill="#7FB05A"/>
      ${[120, 380, 700, 960]
        .map((x, i) => `<g transform="translate(${x},${1060 - (i % 2) * 40})"><rect x="-18" y="0" width="36" height="200" fill="#7A5236"/><circle r="${110 + (i % 2) * 20}" cy="-40" fill="#4E8F52"/><circle r="10" cx="-40" cy="-40" fill="#FF8A5B"/><circle r="10" cx="30" cy="-80" fill="#FF8A5B"/><circle r="10" cx="50" cy="0" fill="#FFC93C"/></g>`)
        .join("")}
    </svg>`,
    front: `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <path d="M0,1780 Q200,1700 400,1780 T800,1760 T1080,1780 L1080,1920 L0,1920Z" fill="#5E8F44"/>
      ${Array.from({ length: 14 }, (_, i) => `<circle cx="${40 + i * 78}" cy="${1790 + (i % 3) * 12}" r="10" fill="${["#FFFFFF", "#FFC93C", "#FF8A80"][i % 3]}"/>`).join("")}
    </svg>`,
  },
};
