"use client";

import { useState } from "react";
import Link from "next/link";
import { autoDirectAction, exportDraftAction, setMusicAction } from "../../actions";
import { useAction } from "./useAction";

type Exp = { id: string; name: string; created_at: string; duration_sec: string | null };
type PresetOpt = { id: string; label: string; aspectRatio: string };

/**
 * Draft video (FFmpeg, local, free): any platform from the same assets (smart reframe), a scene
 * range (long video to shorts), captions, motion, brand kit and end card. Plus printable storyboard.
 */
export default function ExportPanel({ projectId, exports, missingPreviews, presets, projectPreset, sceneCount, hasBrand }: {
  projectId: string; exports: Exp[]; missingPreviews: number; presets: PresetOpt[]; projectPreset: string; sceneCount: number; hasBrand: boolean;
}) {
  const { pending, error, run } = useAction();
  const [o, setO] = useState({ captions: true, motion: true, audio: true, brand: hasBrand, endCard: hasBrand, presetId: projectPreset, fromPos: 1, toPos: sceneCount });
  const set = <K extends keyof typeof o>(k: K, v: (typeof o)[K]) => setO({ ...o, [k]: v });
  const latest = exports[0];
  const box = (k: "captions" | "motion" | "audio" | "brand" | "endCard", label: string, disabled = false) => (
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={o[k]} disabled={disabled} onChange={(e) => set(k, e.target.checked)} /> {label}</label>
  );
  const isRange = o.fromPos > 1 || o.toPos < sceneCount;
  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-bold">التصدير</h2>
      <div>
        <label className="label" htmlFor="ex-preset">المنصة والمقاس</label>
        <select id="ex-preset" className="field" value={o.presetId} onChange={(e) => set("presetId", e.target.value)}>
          {presets.map((p) => <option key={p.id} value={p.id}>{p.label} ({p.aspectRatio}){p.id === projectPreset ? " · الأصلي" : ""}</option>)}
        </select>
        {o.presetId !== projectPreset && <p className="mt-1 text-xs text-muted">إعادة تأطير محلية من الأصول نفسها، دون توليد جديد.</p>}
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span>المشاهد من</span>
        <input type="number" className="field w-16 py-1" min={1} max={sceneCount} value={o.fromPos} aria-label="من المشهد" onChange={(e) => set("fromPos", Number(e.target.value))} />
        <span>إلى</span>
        <input type="number" className="field w-16 py-1" min={o.fromPos} max={sceneCount} value={o.toPos} aria-label="إلى المشهد" onChange={(e) => set("toPos", Number(e.target.value))} />
      </div>
      {isRange && <p className="text-xs text-muted">مقطع قصير من الفيديو الطويل (Shorts).</p>}
      <div className="grid grid-cols-2 gap-1">
        {box("captions", "ترجمة عربية مدمجة")}
        {box("motion", "حركة الكاميرا")}
        {box("audio", "صوت المشاهد والموسيقى")}
        {box("brand", "علامتي (شعار/اسم)", !hasBrand)}
        {box("endCard", "بطاقة دعوة ختامية", !hasBrand)}
      </div>
      {!hasBrand && <p className="text-xs text-muted"><Link className="text-primary underline" href="/brand">أضيفي هوية علامتك</Link> لتظهر في الفيديو.</p>}
      <button className="btn btn-primary w-full justify-between" disabled={pending || missingPreviews > 0}
        onClick={() => run(() => exportDraftAction(projectId, { ...o, fromPos: isRange ? o.fromPos : undefined, toPos: isRange ? o.toPos : undefined }))}>
        <span>{pending ? "جارٍ تصدير الفيديو…" : "🎬 تصدير فيديو مسودة MP4"}</span><span className="text-xs">مجاني، على هذا الجهاز</span>
      </button>
      {missingPreviews > 0 && <p className="text-xs text-danger">{missingPreviews} مشاهد بلا معاينة. ولّديها أولًا.</p>}
      <p className="text-xs text-muted">الصور تجريبية حتى يُضاف مزوّد صور. الحركة تقريب وتحريك محلي للصورة، وليست تحريكًا ذكيًا للمحتوى.</p>
      {exports.length > 0 && (
        <div className="space-y-2">
          <video key={latest.id} src={`/api/assets/${latest.id}`} controls preload="metadata" className="w-full rounded-lg bg-black" data-testid="export-video" />
          <ul className="space-y-1 text-sm">
            {exports.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2">
                <span className="truncate">{e.name}</span>
                <a className="btn btn-sm shrink-0" href={`/api/assets/${e.id}`} download={e.name}>⬇ {Math.round(Number(e.duration_sec ?? 0))} ث</a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Link href={`/projects/${projectId}/print`} className="btn w-full justify-between" target="_blank">
        <span>🖨️ لوحة القصة للطباعة / PDF</span><span className="text-xs">احفظيها PDF من نافذة الطباعة</span>
      </Link>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </section>
  );
}

/** Project-level production tools: local AI director and background music. */
export function ProductionPanel({ projectId, musicAssetId, musicVolume }: { projectId: string; musicAssetId: string | null; musicVolume: number }) {
  const { pending, error, run } = useAction();
  const [vol, setVol] = useState(musicVolume);
  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-bold">الإخراج والصوت</h2>
      <button className="btn w-full justify-between" disabled={pending} onClick={() => run(() => autoDirectAction(projectId))}>
        <span>🎥 المخرج الآلي</span><span className="text-xs">قواعد محلية</span>
      </button>
      <p className="text-xs text-muted">يقترح الكاميرا والحركة للمشاهد الفارغة فقط، ولا يغيّر اختياراتك.</p>
      <div className="space-y-2 border-t border-line pt-3">
        <div className="label">موسيقى الخلفية</div>
        {musicAssetId ? (
          <>
            <audio src={`/api/assets/${musicAssetId}`} controls className="w-full" />
            <label className="block text-sm">المستوى: {Math.round(vol * 100)}٪
              <input type="range" min={0} max={1} step={0.05} value={vol} className="w-full" onChange={(e) => setVol(Number(e.target.value))}
                onMouseUp={() => run(() => setMusicAction(projectId, null, vol))} onTouchEnd={() => run(() => setMusicAction(projectId, null, vol))} />
            </label>
            <button className="btn btn-sm" disabled={pending} onClick={() => run(() => setMusicAction(projectId, null))}>إزالة الموسيقى</button>
          </>
        ) : (
          <form className="flex flex-wrap items-center gap-2" action={(fd) => run(() => setMusicAction(projectId, fd))}>
            <input type="file" name="file" accept=".mp3,.wav,.m4a,.aac,.ogg,audio/*" className="text-sm" aria-label="ملف الموسيقى" />
            <button className="btn btn-sm" disabled={pending}>ارفعي</button>
          </form>
        )}
        <p className="text-xs text-muted">استخدمي موسيقى تملكين حق استخدامها تجاريًا.</p>
      </div>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </section>
  );
}
