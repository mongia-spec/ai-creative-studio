"use client";

import { useState, useTransition } from "react";
import { exportMultiAction, socialCopyAction } from "@/app/actions";
import { useAction } from "../useAction";

type P = { id: string; label: string; aspectRatio: string; safeArea: { top: number; bottom: number; left: number; right: number }; captionPos: "bottom" | "center" };

function CopyGenerator({ projectId, kind, title }: { projectId: string; kind: "hook" | "cta"; title: string }) {
  const [lines, setLines] = useState<string[] | null>(null);
  const [mock, setMock] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="card space-y-2 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">{title}</h2>
        <button className="btn btn-sm" disabled={pending} onClick={() => start(async () => {
          const r = await socialCopyAction(projectId, kind);
          if (r.ok) { setLines(r.lines); setMock(r.mock); setErr(null); } else setErr(r.error);
        })}>اقترحي</button>
      </div>
      {lines && (
        <ul className="space-y-1">
          {lines.map((l) => (
            <li key={l} className="flex items-center justify-between gap-2 rounded bg-surface-2 px-2 py-1 text-sm">
              <span>{l}</span>
              <button className="btn btn-sm" onClick={() => navigator.clipboard?.writeText(l)}>نسخ</button>
            </li>
          ))}
        </ul>
      )}
      {mock && <p className="text-xs text-muted">مقترحات من قوالب ثابتة (مزوّد تجريبي). المزوّد الحقيقي يكتب جملًا جديدة مخصصة.</p>}
      {err && <p className="text-sm text-danger">{err}</p>}
    </section>
  );
}

/** Safe zones per platform drawn over the same preview: what stays visible under the platform UI. */
function SafeZone({ p, img, caption }: { p: P; img: string | null; caption: string }) {
  const s = p.safeArea;
  return (
    <figure className="space-y-1">
      <div className="relative w-full overflow-hidden rounded-lg bg-black" style={{ aspectRatio: p.aspectRatio.replace(":", "/") }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {img && <img src={`/api/assets/${img}`} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />}
        <div className="absolute border-2 border-dashed border-white/80"
          style={{ top: `${s.top}%`, bottom: `${s.bottom}%`, left: `${s.left}%`, right: `${s.right}%` }} />
        {caption && (
          <p className="absolute inset-x-[8%] mx-auto w-fit rounded bg-black/70 px-1 text-center text-[10px] leading-snug text-white"
            style={p.captionPos === "center" ? { top: "60%" } : { bottom: `${s.bottom + 2}%` }}>{caption.slice(0, 60)}</p>
        )}
      </div>
      <figcaption className="text-center text-xs">{p.label} · {p.aspectRatio}</figcaption>
    </figure>
  );
}

export default function SocialStudio(props: {
  projectId: string; previewAssetId: string | null; caption: string; presets: P[]; projectPreset: string; hasBrand: boolean; missingPreviews: number;
  exports: { id: string; name: string }[];
}) {
  const { pending, error, run } = useAction();
  const [sel, setSel] = useState<string[]>([props.projectPreset]);
  const toggle = (id: string) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <CopyGenerator projectId={props.projectId} kind="hook" title="افتتاحيات جاذبة (Hooks)" />
        <CopyGenerator projectId={props.projectId} kind="cta" title="دعوات للتفاعل (CTA)" />
      </div>
      <section className="card space-y-3 p-4">
        <h2 className="font-bold">تصدير لعدة منصات من الأصول نفسها</h2>
        <p className="text-sm text-muted">اختاري المنصات. الإطار المتقطع هو المنطقة الآمنة التي لا تغطيها أزرار المنصة، والترجمة تبقى داخلها. إعادة التأطير محلية ومجانية.</p>
        <div className="grid grid-cols-3 items-start gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {props.presets.map((p) => (
            <label key={p.id} className={`cursor-pointer rounded-lg border p-1 ${sel.includes(p.id) ? "border-primary ring-2 ring-primary" : "border-line"}`}>
              <input type="checkbox" className="sr-only" checked={sel.includes(p.id)} onChange={() => toggle(p.id)} aria-label={p.label} />
              <SafeZone p={p} img={props.previewAssetId} caption={props.caption} />
            </label>
          ))}
        </div>
        <button className="btn btn-primary" disabled={pending || !sel.length || props.missingPreviews > 0}
          onClick={() => run(() => exportMultiAction(props.projectId, sel, { captions: true, motion: true, audio: true, brand: props.hasBrand, endCard: props.hasBrand }))}>
          {pending ? "جارٍ التصدير…" : `🎬 صدّري ${sel.length} نسخ`}
        </button>
        {props.missingPreviews > 0 && <p className="text-xs text-danger">بعض المشاهد بلا معاينة. ولّديها أولًا.</p>}
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        {props.exports.length > 0 && (
          <ul className="space-y-1 text-sm">
            {props.exports.map((e) => <li key={e.id} className="flex justify-between gap-2"><span className="truncate">{e.name}</span><a className="btn btn-sm" href={`/api/assets/${e.id}`} download={e.name}>⬇ تنزيل</a></li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
