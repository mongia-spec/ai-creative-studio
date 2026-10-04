"use client";

import { useState } from "react";
import Link from "next/link";
import { exportDraftAction } from "../../actions";
import { useAction } from "./useAction";

type Exp = { id: string; name: string; created_at: string; duration_sec: string | null };

/** Draft video (FFmpeg, local, free) and printable storyboard (save as PDF from the browser). */
export default function ExportPanel({ projectId, exports, missingPreviews }: { projectId: string; exports: Exp[]; missingPreviews: number }) {
  const { pending, error, run } = useAction();
  const [captions, setCaptions] = useState(true);
  const latest = exports[0];
  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-bold">التصدير</h2>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} /> ترجمة عربية مدمجة في الفيديو
      </label>
      <button className="btn btn-primary w-full justify-between" disabled={pending || missingPreviews > 0} onClick={() => run(() => exportDraftAction(projectId, captions))}>
        <span>{pending ? "جارٍ تصدير الفيديو…" : "🎬 تصدير فيديو مسودة MP4"}</span><span className="text-xs">مجاني، على هذا الجهاز</span>
      </button>
      {missingPreviews > 0 && <p className="text-xs text-danger">{missingPreviews} مشاهد بلا معاينة. ولّديها أولًا.</p>}
      <p className="text-xs text-muted">فيديو من معاينات المشاهد بمددها ومقاس المنصة، دون صوت حتى يُضاف مزوّد صوت.</p>
      {latest && (
        <div className="space-y-1">
          <video key={latest.id} src={`/api/assets/${latest.id}`} controls preload="metadata" className="w-full rounded-lg bg-black" data-testid="export-video" />
          <a className="btn btn-sm" href={`/api/assets/${latest.id}`} download={latest.name}>⬇ تنزيل ({Math.round(Number(latest.duration_sec ?? 0))} ث)</a>
        </div>
      )}
      <Link href={`/projects/${projectId}/print`} className="btn w-full justify-between" target="_blank">
        <span>🖨️ لوحة القصة للطباعة / PDF</span><span className="text-xs">احفظيها PDF من نافذة الطباعة</span>
      </Link>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </section>
  );
}
