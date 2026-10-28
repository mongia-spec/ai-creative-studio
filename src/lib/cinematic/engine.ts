/**
 * Cinematic engine — free, local video rendering with code (the HyperFrames / Remotion idea):
 * every shot is an HTML/SVG stage driven by a deterministic clock, captured frame by frame with
 * Playwright (headless Chromium) and encoded with FFmpeg.
 *
 * What it brings together from the video skills:
 *  - camera language: push-in, pull-out, pan, tilt, snap zoom, with easing and parallax depth
 *  - light: golden-hour grade, god rays, floating dust, vignette, film grain, letterbox
 *  - fixed cast: built-in characters (cast.ts) or the owner's own reference pictures (never cropped)
 *  - acting: blink, idle breathing, waving, hopping, entrances, and the mouth driven by the voice
 *  - Arabic text: RTL speech bubbles revealed word by word, titles, value card and credits
 *  - sound: per-line voice placed on the timeline + optional music bed under the voices
 */
import { spawn, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { extname } from "node:path";
import { BUILTIN_CAST } from "./cast";
import { SETS } from "./sets";

// ---------- spec ----------
export interface Vec { x?: number; y?: number; zoom?: number }
export interface CastMember {
  /** Built-in drawing id from cast.ts, or omit and give `image`. */
  builtin?: string;
  /** Path to the owner's reference picture (PNG with transparent background works best). */
  image?: string;
  name?: string;
}
export interface Actor {
  id: string;
  /** Feet position on the stage, 0..1 of width / height. */
  x: number;
  y: number;
  /** Height as a fraction of stage height. */
  size?: number;
  flip?: boolean;
  enter?: "left" | "right" | "pop" | "none";
  wave?: [number, number];
  hop?: number[];
}
/** at: where the bubble points (0..1 of the stage) when the speaker is not on screen, e.g. a student. */
export interface Line { speaker: string; audio: string; text: string; at?: { x: number; y: number } }
export interface Shot {
  dur?: number;
  set?: string;
  /** Background picture instead of a built-in set (shown whole). */
  bgImage?: string;
  camera?: { from?: Vec; to?: Vec; ease?: "inout" | "out" | "snap" };
  actors?: Actor[];
  line?: Line;
  title?: { main: string; sub?: string };
  card?: { lines: string[]; small?: string };
  letterbox?: boolean;
}
export interface FilmSpec {
  width?: number;
  height?: number;
  fps?: number;
  cast: Record<string, CastMember>;
  shots: Shot[];
  music?: string;
  musicVolumeDb?: number;
  /** Optional font files (ttf/otf) embedded so the look is identical on any computer. */
  fonts?: Record<string, string>;
}

interface PreparedShot extends Shot { start: number; dur: number; env?: number[]; lineDur?: number }

// ---------- audio helpers ----------
function probeDuration(path: string): number {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).toString();
  return parseFloat(out);
}
/** Loudness per video frame (0..1) — drives the mouth. */
function envelope(path: string, fps: number): number[] {
  const rate = 16000;
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", path, "-ac", "1", "-ar", String(rate), "-f", "s16le", "-"], { maxBuffer: 1 << 28 });
  const samples = new Int16Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 2));
  const per = Math.round(rate / fps);
  const env: number[] = [];
  for (let i = 0; i < samples.length; i += per) {
    let s = 0;
    const end = Math.min(samples.length, i + per);
    for (let j = i; j < end; j++) s += (samples[j] / 32768) ** 2;
    env.push(Math.sqrt(s / Math.max(1, end - i)));
  }
  const peak = Math.max(0.0001, ...env);
  return env.map((v) => Math.min(1, (v / peak) * 1.25));
}

function prepare(spec: FilmSpec, fps: number): { shots: PreparedShot[]; total: number } {
  let t = 0;
  const shots = spec.shots.map((s) => {
    let dur = s.dur ?? 3;
    let env: number[] | undefined;
    let lineDur: number | undefined;
    if (s.line) {
      lineDur = probeDuration(s.line.audio);
      env = envelope(s.line.audio, fps);
      dur = Math.max(dur, lineDur + 0.9);
    }
    const p: PreparedShot = { ...s, start: t, dur, env, lineDur };
    t += dur;
    return p;
  });
  return { shots, total: t };
}

function fileUrl(p: string): string {
  const mime = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".otf": "font/otf" }[extname(p).toLowerCase()] ?? "application/octet-stream";
  return `data:${mime};base64,${readFileSync(p).toString("base64")}`;
}

// ---------- page ----------
export function buildHtml(spec: FilmSpec, shots: PreparedShot[], total: number, fps: number): string {
  const W = spec.width ?? 1080;
  const H = spec.height ?? 1920;
  const castHtml: Record<string, string> = {};
  for (const [id, c] of Object.entries(spec.cast)) {
    if (c.image && existsSync(c.image)) castHtml[id] = `<img src="${fileUrl(c.image)}" style="width:100%;height:100%;object-fit:contain;object-position:bottom"/>`;
    else castHtml[id] = BUILTIN_CAST[c.builtin ?? id]?.svg ?? "";
  }
  const names = Object.fromEntries(Object.entries(spec.cast).map(([id, c]) => [id, c.name ?? BUILTIN_CAST[c.builtin ?? id]?.name ?? id]));
  const fontFaces = Object.entries(spec.fonts ?? {})
    .filter(([, p]) => existsSync(p))
    .map(([fam, p]) => `@font-face{font-family:'${fam}';src:url(${fileUrl(p)});}`)
    .join("");
  const shotData = shots.map((s) => ({
    start: s.start, dur: s.dur, set: s.set ?? "classroom", camera: s.camera ?? {}, actors: s.actors ?? [],
    line: s.line ? { speaker: s.line.speaker, text: s.line.text, at: s.line.at ?? null } : null, env: s.env ?? [], lineDur: s.lineDur ?? 0,
    title: s.title ?? null, card: s.card ?? null, letterbox: !!s.letterbox, hasBg: !!s.bgImage,
  }));
  const bgImages = shots.map((s) => (s.bgImage && existsSync(s.bgImage) ? fileUrl(s.bgImage) : ""));
  const sets = Object.fromEntries(Object.entries(SETS).map(([k, v]) => [k, v]));

  return `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>
${fontFaces}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:#000;font-family:Cairo,Tajawal,sans-serif}
#stage{position:absolute;inset:0;overflow:hidden}
.layer{position:absolute;inset:0;transform-origin:50% 50%;will-change:transform}
.layer svg,.layer>img.bg{position:absolute;inset:0;width:100%;height:100%}
.layer>img.bg{object-fit:contain;background:#1b1410}
.actor{position:absolute;transform-origin:50% 100%}
.actor svg{width:100%;height:100%;overflow:visible}
#rays,#dust,#grade,#vig,#grain,#ui{position:absolute;inset:0;pointer-events:none}
#grade{background:linear-gradient(180deg,rgba(255,170,80,.10),rgba(255,120,40,.06));mix-blend-mode:soft-light}
#vig{background:radial-gradient(ellipse at 50% 45%,rgba(0,0,0,0) 55%,rgba(30,12,0,.55) 100%)}
#grain{opacity:.07;mix-blend-mode:overlay;width:100%;height:100%;image-rendering:pixelated}
.bar{position:absolute;left:0;right:0;height:0;background:#000;z-index:5}
.bubble{position:absolute;max-width:${Math.round(W * 0.8)}px;background:#fff;border-radius:44px;padding:30px 44px 34px;
  box-shadow:0 18px 40px rgba(60,30,0,.28);border:6px solid #22A699;direction:rtl;text-align:center}
.bubble .who{position:absolute;top:-34px;right:44px;background:#1E5631;color:#fff;font:800 34px Cairo;padding:4px 26px;border-radius:30px}
.bubble .txt{font:800 64px/1.45 Cairo;color:#1d1d1d}
.bubble .w{opacity:.0;display:inline-block;transition:none}
.bubble .tail{position:absolute;bottom:-34px;width:0;height:0;border-left:30px solid transparent;border-right:30px solid transparent;border-top:40px solid #22A699}
.title{position:absolute;left:0;right:0;text-align:center;direction:rtl}
.title .main{font:400 ${Math.round(W * 0.2)}px Lalezar,Cairo;color:#fff;text-shadow:0 0 40px rgba(255,201,60,.9),0 8px 0 #17796F}
.title .sub{font:800 ${Math.round(W * 0.05)}px Cairo;color:#FFE29A;margin-top:10px;text-shadow:0 4px 12px rgba(0,0,0,.5)}
.card{position:absolute;left:8%;right:8%;background:rgba(255,250,240,.94);border-radius:48px;border:8px solid #22A699;padding:44px 30px;text-align:center;direction:rtl;box-shadow:0 20px 50px rgba(0,0,0,.3)}
.card .l{font:800 ${Math.round(W * 0.062)}px/1.5 Cairo;color:#1E5631}
.card .l:first-child{color:#17796F;font-family:Lalezar,Cairo;font-size:${Math.round(W * 0.085)}px}
.card .s{font:700 ${Math.round(W * 0.036)}px Cairo;color:#6b5a45;margin-top:18px}
</style></head><body>
<div id="stage">
  <div class="layer" id="back"></div>
  <canvas id="rays" width="${W}" height="${H}"></canvas>
  <div class="layer" id="mid"></div>
  <div class="layer" id="front"></div>
  <canvas id="dust" width="${W}" height="${H}"></canvas>
  <div id="grade"></div><div id="vig"></div>
  <canvas id="grain" width="${Math.round(W / 4)}" height="${Math.round(H / 4)}"></canvas>
  <div id="ui"></div>
  <div class="bar" id="barT" style="top:0"></div><div class="bar" id="barB" style="bottom:0"></div>
</div>
<script>
const W=${W},H=${H},FPS=${fps},TOTAL=${total};
const SHOTS=${JSON.stringify(shotData)};
const SETS=${JSON.stringify(sets)};
const CAST=${JSON.stringify(castHtml)};
const NAMES=${JSON.stringify(names)};
const BG=${JSON.stringify(bgImages)};
const back=document.getElementById('back'),mid=document.getElementById('mid'),front=document.getElementById('front'),ui=document.getElementById('ui');
const rays=document.getElementById('rays').getContext('2d'),dust=document.getElementById('dust').getContext('2d'),grain=document.getElementById('grain').getContext('2d');
let cur=-1;
function rnd(s){return function(){s=(s*16807)%2147483647;return (s-1)/2147483646}}
const R=rnd(7),MOTES=Array.from({length:70},()=>({x:R()*W,y:R()*H,r:1.5+R()*4.5,sp:.2+R()*.8,ph:R()*6.28}));
const ease={inout:t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2,out:t=>1-Math.pow(1-t,3),snap:t=>t<.18?1-Math.pow(1-t/.18,4):1};
const lerp=(a,b,t)=>a+(b-a)*t, clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function mount(i){
  const s=SHOTS[i];cur=i;
  if(s.hasBg){back.innerHTML='<img class="bg" src="'+BG[i]+'">';front.innerHTML='';}
  else{const set=SETS[s.set]||SETS.classroom;back.innerHTML=set.back;front.innerHTML=set.front;}
  mid.innerHTML='';
  s.actors.forEach((a,k)=>{const d=document.createElement('div');d.className='actor';d.id='a'+k;
    const h=(a.size||.42)*H,w=h*400/720;Object.assign(d.style,{width:w+'px',height:h+'px',left:(a.x*W-w/2)+'px',top:(a.y*H-h)+'px'});
    d.innerHTML=CAST[a.id]||'';mid.appendChild(d);});
  ui.innerHTML='';
  if(s.line){const b=document.createElement('div');b.className='bubble';b.id='bub';
    b.innerHTML='<div class="who">'+(NAMES[s.line.speaker]||'')+'</div><div class="txt">'+s.line.text.split(' ').map(w=>'<span class="w">'+w+'</span>').join(' ')+'</div><div class="tail"></div>';ui.appendChild(b);}
  if(s.title){const t=document.createElement('div');t.className='title';t.id='ttl';t.innerHTML='<div class="main">'+s.title.main+'</div>'+(s.title.sub?'<div class="sub">'+s.title.sub+'</div>':'');ui.appendChild(t);}
  if(s.card){const c=document.createElement('div');c.className='card';c.id='crd';c.innerHTML=s.card.lines.map(l=>'<div class="l">'+l+'</div>').join('')+(s.card.small?'<div class="s">'+s.card.small+'</div>':'');ui.appendChild(c);}
}
function camAt(s,lt){const c=s.camera,f=c.from||{},t=c.to||{},e=(ease[c.ease||'inout'])(clamp(lt/s.dur,0,1));
  return {x:lerp(f.x||0,t.x??f.x??0,e),y:lerp(f.y||0,t.y??f.y??0,e),z:lerp(f.zoom||1,t.zoom??f.zoom??1,e)};}
function applyCam(el,c,p){const z=1+(c.z-1)*p;el.style.transform='translate('+(-c.x*W*p)+'px,'+(-c.y*H*p)+'px) scale('+z+')';}
window.__seek=function(T){
  let i=SHOTS.findIndex(s=>T>=s.start&&T<s.start+s.dur);if(i<0)i=SHOTS.length-1;
  if(i!==cur)mount(i);
  const s=SHOTS[i],lt=T-s.start,c=camAt(s,lt);
  applyCam(back,c,.75);applyCam(mid,c,1);applyCam(front,c,1.35);
  front.style.filter='blur(6px)';
  // shot fade in/out (soft cut)
  const fade=Math.min(1,lt/.25,(s.dur-lt)/.25);document.getElementById('stage').style.opacity=(i===0||true)?clamp(.15+fade*.85,0,1):1;
  // actors
  const frame=Math.floor(lt*FPS),speaking=s.line?s.line.speaker:null,lineOn=lt>=.35&&lt<.35+s.lineDur;
  const amp=(speaking&&lineOn)?(s.env[Math.floor((lt-.35)*FPS)]||0):0;
  s.actors.forEach((a,k)=>{const d=document.getElementById('a'+k);if(!d)return;
    let tx=0,sc=1,ty=0;const ent=clamp(lt/.6,0,1),eo=ease.out(ent);
    if(a.enter==='left')tx=(1-eo)*-W*.6; if(a.enter==='right')tx=(1-eo)*W*.6; if(a.enter==='pop')sc=.2+.8*eo+Math.sin(ent*Math.PI)*.12;
    const breathe=1+Math.sin(T*2.4+k)*.012; let bob=0;
    if(a.hop)a.hop.forEach(h=>{const q=(lt-h)/.45;if(q>0&&q<1)bob-=Math.sin(q*Math.PI)*.06*H;});
    const talk=(a.id===speaking)?amp*.025:0;
    d.style.transform='translate('+tx+'px,'+(ty+bob)+'px) scaleX('+(a.flip?-1:1)+') scale('+(sc*breathe)+','+(sc*(breathe+talk))+')';
    const eyes=d.querySelector('.eyes');if(eyes){const bl=((T*FPS+k*37)%(FPS*3.2))<4;eyes.style.transform=bl?'scaleY(.1)':'none';eyes.style.transformOrigin='0 4px';}
    const mo=d.querySelector('.mouth-open'),mc=d.querySelector('.mouth-closed');
    if(mo&&mc){const open=a.id===speaking?clamp(amp*1.3,0,1):0;mo.setAttribute('opacity',open>.12?1:0);mc.setAttribute('opacity',open>.12?0:1);
      const sh=d.querySelector('.mouth-shape');if(sh){sh.setAttribute('ry',6+open*20);sh.setAttribute('rx',15+open*7);}}
    const arm=d.querySelector('.arm-wave');if(arm){let ang=0;if(a.wave&&lt>=a.wave[0]&&lt<=a.wave[1])ang=-120+Math.sin((lt-a.wave[0])*12)*22;arm.style.transform='rotate('+ang+'deg)';}
    d.querySelectorAll('.antenna-glow').forEach(g=>g.style.opacity=.75+.25*Math.sin(T*6+k));
  });
  // bubble
  const b=document.getElementById('bub');
  if(b){const sp=s.actors.find(a=>a.id===speaking)||(s.line.at?{x:s.line.at.x,y:s.line.at.y,size:0}:null);const bx=sp?sp.x:.5;
    b.style.right=clamp((1-bx)*W-b.offsetWidth/2,40,W-b.offsetWidth-40)+'px';
    const by=sp?(sp.y-(sp.size||.42))*H-b.offsetHeight-60:H*.15; b.style.top=clamp(by,90,H-b.offsetHeight-90)+'px';
    const tail=b.querySelector('.tail');tail.style.right=clamp((1-bx)*W-parseFloat(b.style.right)-30,30,b.offsetWidth-90)+'px';
    const ws=b.querySelectorAll('.w'),prog=clamp((lt-.3)/Math.max(.5,s.lineDur*.92),0,1);
    ws.forEach((w,j)=>{const on=clamp(prog*ws.length-j+1,0,1);w.style.opacity=on;w.style.transform='translateY('+(1-on)*14+'px)';});
    const pin=ease.out(clamp(lt/.35,0,1));b.style.opacity=pin;b.style.transform='scale('+(.85+.15*pin)+')';}
  const tt=document.getElementById('ttl');if(tt){const p=ease.out(clamp((lt-.2)/.9,0,1));tt.style.top=(H*.2+(1-p)*80)+'px';tt.style.opacity=p;tt.style.letterSpacing=((1-p)*30)+'px';}
  const cr=document.getElementById('crd');if(cr){const p=ease.out(clamp((lt-.3)/.8,0,1));cr.style.top=(H*.12+(1-p)*120)+'px';cr.style.opacity=p;}
  // letterbox
  const lb=s.letterbox?H*.075*ease.out(clamp(lt/.6,0,1)):0;document.getElementById('barT').style.height=lb+'px';document.getElementById('barB').style.height=lb+'px';
  // god rays
  rays.clearRect(0,0,W,H);const set=SETS[s.set]||SETS.classroom;
  if(!s.hasBg){const L={x:set.light.x-c.x*W*.75,y:set.light.y-c.y*H*.75};rays.globalCompositeOperation='lighter';
    for(let r=0;r<6;r++){const a=2.05+r*.13+Math.sin(T*.4+r)*.02,len=H*1.25,wd=.05+.03*Math.sin(T*.7+r*2);
      const g=rays.createLinearGradient(L.x,L.y,L.x+Math.cos(a)*len,L.y+Math.sin(a)*len);g.addColorStop(0,'rgba(255,225,150,'+(.16+.06*Math.sin(T+r))+')');g.addColorStop(1,'rgba(255,225,150,0)');
      rays.fillStyle=g;rays.beginPath();rays.moveTo(L.x,L.y);rays.lineTo(L.x+Math.cos(a-wd)*len,L.y+Math.sin(a-wd)*len);rays.lineTo(L.x+Math.cos(a+wd)*len,L.y+Math.sin(a+wd)*len);rays.closePath();rays.fill();}}
  // dust motes
  dust.clearRect(0,0,W,H);MOTES.forEach(m=>{const x=(m.x+Math.sin(T*m.sp+m.ph)*40-c.x*W*1.2)%W,y=(m.y-T*m.sp*30+H*4)%H;
    dust.fillStyle='rgba(255,240,200,'+(.25+.35*Math.abs(Math.sin(T+m.ph)))+')';dust.beginPath();dust.arc((x+W)%W,y,m.r,0,6.28);dust.fill();});
  // film grain
  const gi=grain.createImageData(grain.canvas.width,grain.canvas.height),gr=rnd(1+Math.floor(T*FPS));
  for(let p=0;p<gi.data.length;p+=4){const v=gr()*255;gi.data[p]=gi.data[p+1]=gi.data[p+2]=v;gi.data[p+3]=255;}grain.putImageData(gi,0,0);
};
window.__ready=document.fonts.ready.then(()=>true);
</script></body></html>`;
}

function loadPlaywright(): { chromium: { launch: (o?: object) => Promise<any> } } {
  const req = createRequire(`${process.cwd()}/package.json`);
  try { return req("playwright"); } catch {
    // Fall back to a global install (npm root -g)
    const root = execFileSync("npm", ["root", "-g"]).toString().trim();
    return req(`${root}/playwright`);
  }
}

export interface RenderResult { path: string; durationSec: number; frames: number }

/** Render a film spec to an MP4 (H.264 + AAC). */
export async function renderFilm(spec: FilmSpec, outPath: string, opts: { onProgress?: (done: number, total: number) => void; stillsAt?: number[]; stillsDir?: string } = {}): Promise<RenderResult> {
  const fps = spec.fps ?? 30;
  const W = spec.width ?? 1080;
  const H = spec.height ?? 1920;
  const { shots, total } = prepare(spec, fps);
  const html = buildHtml(spec, shots, total, fps);
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate("window.__ready");

  const silent = outPath.replace(/\.mp4$/i, "") + ".video.mp4";
  const enc = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", silent], { stdio: ["pipe", "inherit", "inherit"] });
  const frames = Math.round(total * fps);
  for (let f = 0; f < frames; f++) {
    await page.evaluate(`window.__seek(${(f / fps).toFixed(4)})`);
    const buf: Buffer = await page.screenshot({ type: "jpeg", quality: 92 });
    if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once("drain", r));
    if (opts.stillsAt && opts.stillsDir && opts.stillsAt.some((t) => Math.round(t * fps) === f)) {
      await page.screenshot({ path: `${opts.stillsDir}/still_${(f / fps).toFixed(1)}.png` });
    }
    opts.onProgress?.(f + 1, frames);
  }
  enc.stdin.end();
  await new Promise<void>((res, rej) => enc.on("close", (c) => (c === 0 ? res() : rej(new Error("ffmpeg encode failed")))));
  await browser.close();

  // Audio: voice lines at their shot time (+0.35 s) and an optional quiet music bed.
  const voiced = shots.filter((s) => s.line);
  const inputs: string[] = ["-i", silent];
  const parts: string[] = [];
  voiced.forEach((s, i) => {
    inputs.push("-i", s.line!.audio);
    const ms = Math.round((s.start + 0.35) * 1000);
    parts.push(`[${i + 1}:a]aresample=48000,adelay=${ms}|${ms},apad[v${i}]`);
  });
  let mixIn = voiced.map((_, i) => `[v${i}]`).join("");
  let n = voiced.length;
  if (spec.music && existsSync(spec.music)) {
    inputs.push("-stream_loop", "-1", "-i", spec.music);
    parts.push(`[${voiced.length + 1}:a]aresample=48000,volume=${spec.musicVolumeDb ?? -20}dB,afade=t=out:st=${Math.max(0, total - 1.5)}:d=1.5[m]`);
    mixIn += "[m]";
    n++;
  }
  if (n === 0) {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", silent, "-c", "copy", outPath]);
  } else {
    parts.push(`${mixIn}amix=inputs=${n}:normalize=0:duration=longest,atrim=0:${total.toFixed(3)}[a]`);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", parts.join(";"), "-map", "0:v", "-map", "[a]",
      "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", outPath]);
  }
  return { path: outPath, durationSec: total, frames };
}
