"use client";

import { useEffect, useRef, useState } from "react";
import AskPanel from "@/app/components/AskPanel";

type PScene = { id: string; position: number; title: string; previewAssetId: string | null; subtitle: string; durationSec: number; cast: string[] };
type PChar = { id: string; name: string; avatarAssetId: string | null; knowledge: number };

/**
 * Interactive player: scenes play with burned-in style Arabic subtitles. "اسأل …" pauses the
 * video and the character answers inside the frame, with its saved face and voice; the
 * conversation keeps its context, and "تابع المشاهدة" resumes from the same moment.
 */
export default function Player({ projectId, aspect, scenes, characters }: { projectId: string; aspect: string; scenes: PScene[]; characters: PChar[] }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [asking, setAsking] = useState<PChar | null>(null);
  const tick = useRef<number | null>(null);
  const scene = scenes[i];
  // Characters who can be asked: those in this scene first, then the rest of the cast.
  const askable = [...characters].sort((a, b) => Number(scene.cast.includes(b.id)) - Number(scene.cast.includes(a.id)));

  useEffect(() => {
    if (!playing || asking) return;
    tick.current = window.setInterval(() => setElapsed((e) => e + 0.1), 100);
    return () => { if (tick.current) window.clearInterval(tick.current); };
  }, [playing, asking]);

  useEffect(() => {
    if (elapsed < scene.durationSec) return;
    if (i < scenes.length - 1) { setI(i + 1); setElapsed(0); } else { setPlaying(false); setElapsed(scene.durationSec); }
  }, [elapsed, i, scene.durationSec, scenes.length]);

  const go = (n: number) => { setI(Math.max(0, Math.min(scenes.length - 1, n))); setElapsed(0); };
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
        {!asking && askable.length > 0 && (
          <div className="absolute bottom-3 start-3 flex flex-wrap gap-2">
            {askable.map((c) => (
              <button key={c.id} className="btn btn-sm btn-primary shadow-lg" onClick={() => { setAsking(c); }}>
                💬 اسأل {c.name}
              </button>
            ))}
          </div>
        )}
        {asking && (
          <div className="absolute inset-0 flex flex-col justify-end bg-black/55 p-3" role="dialog" aria-label={`محادثة مع ${asking.name}`}>
            <div className="max-h-full overflow-y-auto rounded-2xl bg-surface/95 p-3 shadow-xl">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-bold">{asking.name}</span>
                <button className="btn btn-sm" onClick={() => setAsking(null)}>▶ تابع المشاهدة</button>
              </div>
              {asking.knowledge === 0 && <p className="mb-2 text-xs text-muted">لا معرفة لهذه الشخصية بعد؛ ستعيد الحديث بلطف إلى القصة.</p>}
              <AskPanel key={asking.id} characterId={asking.id} characterName={asking.name} avatarAssetId={asking.avatarAssetId}
                channel="player" projectId={projectId} defaultTier="avatar" compact />
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-sm" onClick={() => go(i - 1)} disabled={i === 0} aria-label="المشهد السابق">→</button>
        <button className="btn btn-sm btn-primary" onClick={() => { if (!playing && i === scenes.length - 1 && elapsed >= scene.durationSec) go(0); setPlaying(!playing); }} disabled={!!asking}>
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
