"use client";

import { useEffect, useRef, useState } from "react";
import AskPanel from "@/app/components/AskPanel";
import type { Tier } from "@/lib/conversation";
import type { Choice } from "@/lib/interactive";
import { respondAction } from "@/app/projects/[id]/interactive/actions";

type PScene = { id: string; position: number; title: string; previewAssetId: string | null; subtitle: string; durationSec: number; cast: string[] };
type PChar = { id: string; name: string; avatarAssetId: string | null; knowledge: number };
type PInt = { id: string; sceneId: string; atSec: number; kind: "question" | "hotspot" | "branch"; prompt: string; choices: Choice[] };

/** A timed question or branch shown inside the frame; the video waits for the viewer. */
function InteractionOverlay({ it, onDone }: { it: PInt; onDone: (gotoPosition: number | null) => void }) {
  const [res, setRes] = useState<{ correct: boolean | null; feedback: string; gotoPosition: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-label={it.prompt} data-testid="interaction">
      <div className="w-full max-w-sm space-y-3 rounded-2xl bg-surface p-4 shadow-xl">
        <p className="text-lg font-bold">{it.prompt}</p>
        {!res ? (
          <div className="grid gap-2">
            {it.choices.map((c, k) => (
              <button key={k} className="btn justify-center" disabled={busy} onClick={async () => {
                setBusy(true);
                const r = await respondAction(it.id, k);
                setBusy(false);
                if (r.ok) {
                  if (it.kind === "branch" && !r.feedback) onDone(r.gotoPosition);
                  else setRes(r);
                }
              }}>{c.label}</button>
            ))}
          </div>
        ) : (
          <>
            <p className={res.correct === false ? "text-danger" : "text-primary"} data-testid="feedback">{res.feedback}</p>
            <div className="flex gap-2">
              {res.correct === false && <button className="btn btn-sm" onClick={() => setRes(null)}>حاول مرة أخرى</button>}
              <button className="btn btn-sm btn-primary" onClick={() => onDone(res.gotoPosition)}>▶ تابع</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Interactive player: scenes play with burned-in style Arabic subtitles. "اسأل …" pauses the
 * video and the character answers inside the frame, with its saved face and voice; the
 * conversation keeps its context, and "تابع المشاهدة" resumes from the same moment.
 */
export default function Player({ projectId, aspect, scenes, characters, settings, interactions }: {
  projectId: string; aspect: string; scenes: PScene[]; characters: PChar[]; settings: { allowMic: boolean; maxTier: Tier }; interactions: PInt[];
}) {
  const [fired, setFired] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<PInt | null>(null);
  const [spot, setSpot] = useState<PInt | null>(null);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [asking, setAsking] = useState<PChar | null>(null);
  const tick = useRef<number | null>(null);
  const scene = scenes[i];
  // Characters who can be asked: those in this scene first, then the rest of the cast.
  const askable = [...characters].sort((a, b) => Number(scene.cast.includes(b.id)) - Number(scene.cast.includes(a.id)));

  const here = interactions.filter((x) => x.sceneId === scene.id);
  // Fire the first blocking interaction whose time has come in this scene.
  useEffect(() => {
    if (active) return;
    const due = here.find((x) => x.kind !== "hotspot" && !fired.has(x.id) && elapsed >= x.atSec);
    if (due && playing) { setActive(due); setFired(new Set(fired).add(due.id)); }
  }, [elapsed, playing, active, here, fired]);

  useEffect(() => {
    if (!playing || asking || active) return;
    tick.current = window.setInterval(() => setElapsed((e) => e + 0.1), 100);
    return () => { if (tick.current) window.clearInterval(tick.current); };
  }, [playing, asking, active]);

  useEffect(() => {
    if (elapsed < scene.durationSec || active) return;
    if (here.some((x) => x.kind !== "hotspot" && !fired.has(x.id))) return; // a question at the very end comes first
    if (i < scenes.length - 1) { setI(i + 1); setElapsed(0); } else { setPlaying(false); setElapsed(scene.durationSec); }
  }, [elapsed, i, scene.durationSec, scenes.length, active, here, fired]);

  const go = (n: number) => { setI(Math.max(0, Math.min(scenes.length - 1, n))); setElapsed(0); setSpot(null); };
  const total = scenes.reduce((a, s) => a + s.durationSec, 0);
  const before = scenes.slice(0, i).reduce((a, s) => a + s.durationSec, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div className="relative mx-auto max-h-[78vh] overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: aspect }} data-testid="player-frame">
        {scene.previewAssetId
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={`/api/assets/${scene.previewAssetId}`} alt={scene.title} className="h-full w-full object-cover" />
          : <div className="flex h-full items-center justify-center text-white/60">{scene.title}</div>}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent p-3 text-sm text-white">
          <span>المشهد {scene.position} / {scenes.length}</span>
          <span>{scene.title}</span>
        </div>
        {!asking && scene.subtitle && (
          <p className="absolute inset-x-4 bottom-16 mx-auto w-fit max-w-[92%] rounded-lg bg-black/70 px-3 py-1.5 text-center text-lg leading-relaxed text-white" data-testid="subtitle">
            {scene.subtitle}
          </p>
        )}
        {!asking && !active && askable.length > 0 && (
          <div className="absolute bottom-3 start-3 flex flex-wrap gap-2">
            {askable.map((c) => (
              <button key={c.id} className="btn btn-sm btn-primary shadow-lg" onClick={() => { setAsking(c); }}>
                💬 اسأل {c.name}
              </button>
            ))}
          </div>
        )}
        {!asking && !active && here.filter((x) => x.kind === "hotspot" && elapsed >= x.atSec).map((x) => (
          <button key={x.id} className="absolute -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-primary px-2 py-1 text-xs text-primary-ink shadow-lg ring-4 ring-white/40"
            style={{ left: `${x.choices[0]?.x ?? 50}%`, top: `${x.choices[0]?.y ?? 50}%` }} onClick={() => { setSpot(x); void respondAction(x.id, 0); }}>
            ✨ {x.choices[0]?.label}
          </button>
        ))}
        {spot && (
          <div className="absolute inset-x-4 top-14 rounded-xl bg-surface/95 p-3 text-sm shadow-xl" role="note">
            <p className="font-bold">{spot.prompt}</p>
            <p>{spot.choices[0]?.feedback}</p>
            <button className="btn btn-sm mt-2" onClick={() => setSpot(null)}>إغلاق</button>
          </div>
        )}
        {active && <InteractionOverlay it={active} onDone={(goto) => {
          setActive(null);
          if (goto) { const k = scenes.findIndex((x) => x.position === goto); if (k >= 0) { setI(k); setElapsed(0); } }
        }} />}
        {asking && (
          <div className="absolute inset-0 flex flex-col justify-end bg-black/55 p-3" role="dialog" aria-label={`محادثة مع ${asking.name}`}>
            <div className="max-h-full overflow-y-auto rounded-2xl bg-surface/95 p-3 shadow-xl">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-bold">{asking.name}</span>
                <button className="btn btn-sm" onClick={() => setAsking(null)}>▶ تابع المشاهدة</button>
              </div>
              {asking.knowledge === 0 && <p className="mb-2 text-xs text-muted">لا معرفة لهذه الشخصية بعد؛ ستعيد الحديث بلطف إلى القصة.</p>}
              <AskPanel key={asking.id} characterId={asking.id} characterName={asking.name} avatarAssetId={asking.avatarAssetId}
                channel="player" projectId={projectId} defaultTier="avatar" compact maxTier={settings.maxTier} allowMic={settings.allowMic} />
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-sm" onClick={() => go(i - 1)} disabled={i === 0} aria-label="المشهد السابق">→</button>
        <button className="btn btn-sm btn-primary" onClick={() => { if (!playing && i === scenes.length - 1 && elapsed >= scene.durationSec) { go(0); setFired(new Set()); } setPlaying(!playing); }} disabled={!!asking || !!active}>
          {playing ? "⏸ إيقاف" : "▶ تشغيل"}
        </button>
        <button className="btn btn-sm" onClick={() => go(i + 1)} disabled={i === scenes.length - 1} aria-label="المشهد التالي">←</button>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
          <div className="h-full bg-primary" style={{ width: `${((before + Math.min(elapsed, scene.durationSec)) / total) * 100}%` }} />
        </div>
        <span className="text-xs text-muted">{Math.round(before + elapsed)} / {Math.round(total)} ث</span>
      </div>
      {characters.length === 0 && <p className="text-sm text-muted">اربطي شخصية بالمشاهد لتظهر هنا ويمكن سؤالها.</p>}
    </div>
  );
}
