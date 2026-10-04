"use client";

import { useState } from "react";
import type { Scene, SceneEditable } from "@/lib/scenes";
import {
  addSceneAction, approveAllAction, deleteSceneAction, duplicateSceneAction, moveSceneAction,
  regeneratePreviewAction, setSceneStatusAction, updateSceneAction,
} from "../../actions";
import { useAction } from "./useAction";

type Shot = { id: string; scene_id: string; position: number; description: string; camera: string; duration_sec: number };

const STATUS: Record<Scene["status"], { label: string; cls: string }> = {
  draft: { label: "بانتظار المراجعة", cls: "bg-surface-2 text-muted" },
  approved: { label: "معتمد", cls: "bg-secondary text-white" },
  rejected: { label: "مرفوض", cls: "bg-danger/15 text-danger" },
};

const MAIN_FIELDS: [SceneEditable, string, number][] = [
  ["description", "الوصف", 2],
  ["narration", "التعليق (الراوي)", 2],
  ["dialogue", "الحوار", 2],
];
const DETAIL_FIELDS: [SceneEditable, string, number][] = [
  ["location", "المكان", 1],
  ["characters_text", "الشخصيات", 1],
  ["camera", "الكاميرا", 1],
  ["lighting", "الإضاءة", 1],
  ["mood", "الجو العام", 1],
  ["audio_notes", "ملاحظات الصوت", 1],
  ["visual_prompt", "وصف الصورة (Prompt)", 3],
];

export default function Storyboard(props: { projectId: string; scenes: Scene[]; shots: Shot[]; aspect: string }) {
  const { pending, error, run } = useAction();
  if (props.scenes.length === 0) {
    return (
      <section className="card p-6 text-center text-muted">
        لم تُولَّد المشاهد بعد. اضغط «ولّد النص والمشاهد» في الأعلى.
      </section>
    );
  }
  const pendingCount = props.scenes.filter((s) => s.status === "draft").length;
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">لوحة القصة</h2>
        <div className="flex gap-2">
          <button className="btn btn-sm" disabled={pending} onClick={() => run(() => addSceneAction(props.projectId))}>+ مشهد</button>
          <button className="btn btn-sm btn-primary" disabled={pending || pendingCount === 0} onClick={() => run(() => approveAllAction(props.projectId))}>
            اعتمد كل المشاهد
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <ol className="space-y-4">
        {props.scenes.map((s, i) => (
          <SceneCard key={s.id} scene={s} aspect={props.aspect} first={i === 0} last={i === props.scenes.length - 1}
            shots={props.shots.filter((x) => x.scene_id === s.id)} />
        ))}
      </ol>
    </section>
  );
}

function SceneCard({ scene, aspect, first, last, shots }: { scene: Scene; aspect: string; first: boolean; last: boolean; shots: Shot[] }) {
  const { pending, error, run } = useAction();
  const st = STATUS[scene.status];
  const save = (field: SceneEditable, value: string) => {
    const current = String(scene[field] ?? "");
    if (value === current) return;
    run(() => updateSceneAction(scene.id, { [field]: field === "duration_sec" ? Number(value) : value }));
  };

  return (
    <li className={`card p-4 ${scene.status === "rejected" ? "opacity-60" : ""}`} aria-busy={pending}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-primary px-2 py-0.5 text-sm font-bold text-primary-ink">{scene.position}</span>
          <Field key={`t-${scene.title}`} value={scene.title} onSave={(v) => save("title", v)} className="field font-bold" ariaLabel="عنوان المشهد" />
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span>
      </div>

      <div className="grid gap-4 md:grid-cols-[200px_1fr]">
        <div className="space-y-2">
          <div className="overflow-hidden rounded-lg border border-line bg-surface-2" style={{ aspectRatio: aspect }}>
            {scene.preview_asset_id && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/assets/${scene.preview_asset_id}`} alt={`معاينة المشهد ${scene.position}`} className="h-full w-full object-cover" />
            )}
          </div>
          <button className="btn btn-sm w-full justify-center" disabled={pending} onClick={() => run(() => regeneratePreviewAction(scene.id))}>
            أعد توليد المعاينة
          </button>
          <div>
            <label className="label">المدة (ثانية)</label>
            <Field key={`d-${scene.duration_sec}`} value={String(scene.duration_sec)} type="number" onSave={(v) => save("duration_sec", v)} ariaLabel="المدة" />
          </div>
        </div>

        <div className="min-w-0 space-y-2">
          {MAIN_FIELDS.map(([f, label, rows]) => (
            <div key={f}>
              <label className="label">{label}</label>
              <Field key={`${f}-${scene[f]}`} value={String(scene[f] ?? "")} rows={rows} onSave={(v) => save(f, v)} ariaLabel={label} />
            </div>
          ))}
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-primary">الإخراج والتفاصيل ({shots.length} لقطات)</summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {DETAIL_FIELDS.map(([f, label, rows]) => (
                <div key={f} className={rows > 1 ? "sm:col-span-2" : ""}>
                  <label className="label">{label}</label>
                  <Field key={`${f}-${scene[f]}`} value={String(scene[f] ?? "")} rows={rows} onSave={(v) => save(f, v)} ariaLabel={label} />
                </div>
              ))}
            </div>
            {shots.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {shots.map((sh) => <li key={sh.id}>لقطة {sh.position}: {sh.description} · {sh.camera} · {sh.duration_sec} ث</li>)}
              </ul>
            )}
          </details>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
        <button className="btn btn-sm" disabled={pending || scene.status === "approved"} onClick={() => run(() => setSceneStatusAction(scene.id, "approved"))}>اعتماد</button>
        <button className="btn btn-sm" disabled={pending || scene.status === "rejected"} onClick={() => run(() => setSceneStatusAction(scene.id, "rejected"))}>رفض</button>
        <button className="btn btn-sm" disabled={pending} onClick={() => run(() => duplicateSceneAction(scene.id))}>تكرار</button>
        <button className="btn btn-sm" disabled={pending || first} onClick={() => run(() => moveSceneAction(scene.id, -1))} aria-label="انقل للأعلى">↑ لأعلى</button>
        <button className="btn btn-sm" disabled={pending || last} onClick={() => run(() => moveSceneAction(scene.id, 1))} aria-label="انقل للأسفل">↓ لأسفل</button>
        <button className="btn btn-sm text-danger ms-auto" disabled={pending}
          onClick={() => { if (confirm("حذف هذا المشهد؟")) run(() => deleteSceneAction(scene.id)); }}>حذف</button>
      </div>
      {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
    </li>
  );
}

/** Uncontrolled field that saves on blur. Keyed by its value so server updates reset it. */
function Field(props: { value: string; onSave: (v: string) => void; rows?: number; type?: string; className?: string; ariaLabel: string }) {
  const [v, setV] = useState(props.value);
  const common = { value: v, "aria-label": props.ariaLabel, className: props.className ?? "field", onBlur: () => props.onSave(v) };
  return props.rows && props.rows > 1 ? (
    <textarea {...common} rows={props.rows} onChange={(e) => setV(e.target.value)} />
  ) : (
    <input {...common} type={props.type ?? "text"} min={props.type === "number" ? 1 : undefined} onChange={(e) => setV(e.target.value)} />
  );
}
