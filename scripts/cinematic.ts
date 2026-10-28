/**
 * Render a cinematic film from a JSON spec:
 *   npx tsx scripts/cinematic.ts <spec.json> <out.mp4> [--stills 1,5,9]
 * Paths inside the spec are relative to the spec file.
 */
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve, isAbsolute } from "node:path";
import { renderFilm, type FilmSpec } from "../src/lib/cinematic/engine";

const [specPath, out, flag, stillsArg] = process.argv.slice(2);
if (!specPath || !out) {
  console.error("usage: tsx scripts/cinematic.ts <spec.json> <out.mp4> [--stills 1,5]");
  process.exit(1);
}
const base = dirname(resolve(specPath));
const abs = (p?: string) => (p ? (isAbsolute(p) ? p : resolve(base, p)) : p);
const spec = JSON.parse(readFileSync(specPath, "utf8")) as FilmSpec;
for (const c of Object.values(spec.cast)) c.image = abs(c.image);
for (const s of spec.shots) { if (s.line) s.line.audio = abs(s.line.audio)!; s.bgImage = abs(s.bgImage); }
spec.music = abs(spec.music);
if (spec.fonts) for (const k of Object.keys(spec.fonts)) spec.fonts[k] = abs(spec.fonts[k])!;

const stillsAt = flag === "--stills" && stillsArg ? stillsArg.split(",").map(Number) : undefined;
const stillsDir = stillsAt ? resolve(dirname(resolve(out)), "stills") : undefined;
if (stillsDir) mkdirSync(stillsDir, { recursive: true });

let last = 0;
renderFilm(spec, resolve(out), {
  stillsAt, stillsDir,
  onProgress: (d, t) => { const p = Math.floor((d / t) * 10); if (p !== last) { last = p; console.log(`${p * 10}%`); } },
}).then((r) => console.log(`done ${r.path} ${r.durationSec.toFixed(1)}s ${r.frames} frames`));
