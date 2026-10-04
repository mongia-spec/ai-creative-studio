"use client";

import type { Asset } from "@/lib/assets";
import type { Job } from "@/lib/jobs";
import { archiveProjectAction, retryJobAction, uploadAssetAction } from "../../actions";
import { useAction } from "./useAction";

const JOB_LABEL: Record<string, string> = { "script.generate": "توليد النص", "scene.preview": "معاينة مشهد" };
const JOB_STATUS: Record<string, string> = { queued: "في الانتظار", running: "قيد التنفيذ", succeeded: "تم", failed: "فشل", cancelled: "أُلغي" };

export function JobsPanel({ projectId, jobs }: { projectId: string; jobs: Job[] }) {
  const { pending, error, run } = useAction();
  return (
    <section className="card p-4">
      <h2 className="mb-2 font-bold">مهام التوليد</h2>
      {jobs.length === 0 ? <p className="text-sm text-muted">لا مهام بعد.</p> : (
        <ul className="space-y-1 text-sm">
          {jobs.map((j) => (
            <li key={j.id} className="flex items-center justify-between gap-2">
              <span>{JOB_LABEL[j.type] ?? j.type} · <span className={j.status === "failed" ? "text-danger" : "text-muted"}>{JOB_STATUS[j.status]}</span></span>
              {j.status === "failed" && <button className="btn btn-sm" disabled={pending} onClick={() => run(() => retryJobAction(projectId, j.id))}>أعد المحاولة</button>}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </section>
  );
}

export function AssetsPanel({ projectId, assets }: { projectId: string; assets: Asset[] }) {
  const { pending, error, run } = useAction();
  return (
    <section className="card space-y-2 p-4">
      <h2 className="font-bold">ملفات المشروع</h2>
      <form className="space-y-2" action={(fd) => run(() => uploadAssetAction(projectId, fd))}>
        <input type="file" name="files" multiple accept="image/*,audio/*,video/*,application/pdf,text/plain" className="block w-full text-sm" />
        <button className="btn btn-sm" disabled={pending}>{pending ? "جارٍ الرفع…" : "ارفع"}</button>
      </form>
      <p className="text-xs text-muted">صور، صوت، فيديو، PDF أو نص، حتى 50 ميغابايت. الملف المكرر يُحفظ مرة واحدة.</p>
      {error && <p className="text-sm text-danger">{error}</p>}
      <ul className="space-y-1 text-sm">
        {assets.map((a) => (
          <li key={a.id}>
            <a className="text-primary underline" href={`/api/assets/${a.id}`} target="_blank" rel="noreferrer">{a.name ?? a.id}</a>
            <span className="text-muted"> · {Math.max(1, Math.round(a.byte_size / 1024))} ك.ب</span>
          </li>
        ))}
      </ul>
      <button className="btn btn-sm mt-2 text-danger" onClick={() => { if (confirm("أرشفة المشروع وإخفاؤه من القائمة؟")) archiveProjectAction(projectId); }}>
        أرشفة المشروع
      </button>
    </section>
  );
}
