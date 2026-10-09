"use client";

import { useState } from "react";
import Link from "next/link";
import { moveSceneAction, regeneratePreviewAction, updateSceneAction } from "@/app/actions";
import { useAction } from "../useAction";

type T = { id: string; position: number; title: string; duration: number; preview: string | null; audio: string | null; caption: string; motion: string; status: string; marks: { at: number; kind: string }[] };

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export default function Timeline({ projectId, scenes, aspect, musicAssetId }: { projectId: string; scenes: T[]; aspect: string; musicAssetId: string | null }) {
  const { pending, error, run } = useAction();
  const [pps, setPps] = useState(24); // pixels per second
  const [sel, setSel] = useState<string | null>(null);
  const active = scenes.filter((s) => s.status !== "rejected");
  const total = active.reduce((a, s) => a + s.duration, 0);
  const width = (d: number) => Math.max(56, d * pps);
  const current = scenes.find((s) => s.id === sel);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>المدة الكلية: <b>{fmt(total)}</b> · {active.length} مشاهد</span>
        <label className="flex items-center gap-2">تكبير<input type="range" min={6} max={60} value={pps} onChange={(e) => setPps(Number(e.target.value))} aria-label="تكبير الخط الزمني" /></label>
      </div>
      <div className="card overflow-x-auto p-3" dir="rtl">
        <div className="inline-flex min-w-full flex-col gap-1">
          <div className="flex gap-1" aria-label="مسار الصورة">
            {active.map((s) => (
              <button key={s.id} onClick={() => setSel(s.id)} style={{ width: width(s.duration) }} data-testid="tl-block"
                className={`relative h-20 shrink-0 overflow-hidden rounded border text-start ${sel === s.id ? "border-primary ring-2 ring-primary" : "border-line"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {s.preview && <img src={`/api/assets/${s.preview}`} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />}
                <span className="relative m-1 inline-block rounded bg-black/60 px-1 text-xs text-white">{s.position} · {s.duration}ث</span>
                {s.marks.map((m, k) => (
                  <span key={k} title={m.kind} className="absolute bottom-0 h-3 w-1 bg-warn" style={{ insetInlineStart: `${(m.at / s.duration) * 100}%` }} />
                ))}
              </button>
            ))}
          </div>
          <div className="flex gap-1" aria-label="مسار الترجمة">
            {active.map((s) => <div key={s.id} style={{ width: width(s.duration) }} className="h-6 shrink-0 truncate rounded bg-surface-2 px-1 text-[10px] leading-6">{s.caption || "—"}</div>)}
          </div>
          <div className="flex gap-1" aria-label="مسار صوت المشاهد">
            {active.map((s) => <div key={s.id} style={{ width: width(s.duration) }} className={`h-4 shrink-0 rounded ${s.audio ? "bg-secondary/60" : "bg-surface-2"}`} />)}
          </div>
          <div className={`h-4 rounded ${musicAssetId ? "bg-primary/40" : "bg-surface-2"}`} style={{ width: active.reduce((a, s) => a + width(s.duration) + 4, 0) }} aria-label="مسار الموسيقى" />
        </div>
      </div>
      <p className="text-xs text-muted">المسارات من الأعلى: الصورة (العلامات الصفراء أسئلة أو نقاط تفاعلية)، الترجمة، صوت المشاهد، الموسيقى.</p>
      {current && (
        <section className="card flex flex-wrap items-center gap-3 p-3 text-sm">
          <div className="h-20 overflow-hidden rounded bg-surface-2" style={{ aspectRatio: aspect }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {current.preview && <img src={`/api/assets/${current.preview}`} alt="" className="h-full w-full object-cover" />}
          </div>
          <b>المشهد {current.position}: {current.title}</b>
          <label className="flex items-center gap-1">المدة
            <input key={`${current.id}-${current.duration}`} type="number" min={1} max={600} defaultValue={current.duration} className="field w-20 py-1" aria-label="مدة المشهد"
              onBlur={(e) => Number(e.target.value) !== current.duration && run(() => updateSceneAction(current.id, { duration_sec: Number(e.target.value) }))} />
          </label>
          <button className="btn btn-sm" disabled={pending || current.position === 1} onClick={() => run(() => moveSceneAction(current.id, -1))}>→ قبل</button>
          <button className="btn btn-sm" disabled={pending || current.position === scenes.length} onClick={() => run(() => moveSceneAction(current.id, 1))}>بعد ←</button>
          <button className="btn btn-sm" disabled={pending} onClick={() => run(() => regeneratePreviewAction(current.id))}>↻ أعيدي معاينة هذا المشهد فقط</button>
          <Link className="btn btn-sm" href={`/projects/${projectId}#scene-${current.position}`}>✏️ حرّريه في لوحة القصة</Link>
        </section>
      )}
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}
