"use client";

import SceneAudioPicker from "@/app/components/SceneAudioPicker";
import { useState } from "react";
import Link from "next/link";
import type { Scene, SceneEditable } from "@/lib/scenes";
import type { SceneCast } from "@/lib/scene-memory";
import { STATE_FIELDS } from "@/config/memory-fields";
import { MOTIONS } from "@/config/motion";
import {
  addSceneAction, addShotAction, approveAllAction, deleteSceneAction, deleteShotAction, duplicateSceneAction, moveSceneAction,
  lockOutfitForScenesAction, regeneratePreviewAction, setSceneMediaAction, setCharacterStateAction, setSceneOutfitAction, setSceneCharactersAction, setSceneStatusAction, updateSceneAction, updateShotAction,
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
  ["time_of_day", "الوقت", 1],
  ["camera", "الكاميرا", 1],
  ["lighting", "الإضاءة", 1],
  ["mood", "الجو العام", 1],
  ["audio_notes", "ملاحظات الصوت", 1],
  ["visual_prompt", "وصف الصورة (Prompt)", 3],
];

type CharOption = { id: string; name: string; locked: boolean; outfits: { id: string; name: string }[] };

export default function Storyboard(props: {
  projectId: string; scenes: Scene[]; shots: Shot[]; aspect: string;
  memory: Record<string, SceneCast[]>; prompts: Record<string, string>; characters: CharOption[];
}) {
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
            shots={props.shots.filter((x) => x.scene_id === s.id)} cast={props.memory[s.id] ?? []}
            prompt={props.prompts[s.id] ?? ""} characters={props.characters} projectId={props.projectId} sceneCount={props.scenes.length} />
        ))}
      </ol>
    </section>
  );
}

function SceneCard({ scene, aspect, first, last, shots, cast, prompt, characters, projectId, sceneCount }: {
  scene: Scene; aspect: string; first: boolean; last: boolean; shots: Shot[]; cast: SceneCast[]; prompt: string; characters: CharOption[];
  projectId: string; sceneCount: number;
}) {
  const { pending, error, run } = useAction();
  const st = STATUS[scene.status];
  const save = (field: SceneEditable, value: string) => {
    const current = String(scene[field] ?? "");
    if (value === current) return;
    run(() => updateSceneAction(scene.id, { [field]: field === "duration_sec" ? Number(value) : value }));
  };

  return (
    <li id={`scene-${scene.position}`} className={`card p-4 ${scene.status === "rejected" ? "opacity-60" : ""}`} aria-busy={pending}>
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
          <CastEditor projectId={projectId} sceneId={scene.id} position={scene.position} sceneCount={sceneCount} cast={cast} characters={characters} />
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
            <SceneMedia scene={scene} />
            <ShotsEditor sceneId={scene.id} shots={shots} />
            <div className="mt-3 rounded-lg bg-surface-2 p-2 text-xs">
              <span className="label">الوصف النهائي للصورة (المشهد + الشخصيات + الذاكرة):</span>
              <p className="whitespace-pre-line">{prompt}</p>
            </div>
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
function Field(props: { value: string; onSave: (v: string) => void; rows?: number; type?: string; className?: string; ariaLabel: string; placeholder?: string }) {
  const [v, setV] = useState(props.value);
  const common = { value: v, "aria-label": props.ariaLabel, placeholder: props.placeholder, className: props.className ?? "field", onBlur: () => props.onSave(v) };
  return props.rows && props.rows > 1 ? (
    <textarea {...common} rows={props.rows} onChange={(e) => setV(e.target.value)} />
  ) : (
    <input {...common} type={props.type ?? "text"} min={props.type === "number" ? 1 : undefined} onChange={(e) => setV(e.target.value)} />
  );
}

function CastEditor({ projectId, sceneId, position, sceneCount, cast, characters }: {
  projectId: string; sceneId: string; position: number; sceneCount: number; cast: SceneCast[]; characters: CharOption[];
}) {
  const { pending, error, run } = useAction();
  const inScene = new Set(cast.map((c) => c.characterId));
  const toggle = (id: string) => {
    const next = inScene.has(id) ? [...inScene].filter((x) => x !== id) : [...inScene, id];
    run(() => setSceneCharactersAction(sceneId, next));
  };
  return (
    <div className="space-y-2 rounded-lg border border-line p-3">
      <div className="label">الشخصيات في المشهد</div>
      {characters.length === 0 ? (
        <p className="text-sm text-muted">لا توجد شخصيات. <Link href="/characters" className="text-primary underline">أنشئ شخصية</Link> لتربطها بالمشاهد.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {characters.map((c) => (
            <button key={c.id} type="button" disabled={pending} aria-pressed={inScene.has(c.id)} onClick={() => toggle(c.id)}
              className={`rounded-full border px-3 py-0.5 text-sm ${inScene.has(c.id) ? "border-primary bg-primary text-primary-ink" : "border-line"}`}>
              {c.locked ? "🔒 " : ""}{c.name}
            </button>
          ))}
        </div>
      )}
      {cast.map((c) => (
        <div key={c.characterId} className="space-y-1 border-t border-line pt-2">
          <div className="text-sm font-semibold">ذاكرة {c.name} في هذا المشهد</div>
          <OutfitPicker projectId={projectId} sceneId={sceneId} position={position} sceneCount={sceneCount} cast={c}
            outfits={characters.find((x) => x.id === c.characterId)?.outfits ?? []} />
          <div className="grid gap-2 sm:grid-cols-3">
            {STATE_FIELDS.map(([k, label]) => {
              const eff = c.effective[k];
              const inherited = eff && !c.own[k] ? `من المشهد ${eff.fromPosition}: ${eff.value}` : "بلا تغيير";
              return (
                <div key={k}>
                  <label className="label">{label}</label>
                  <Field key={`${k}-${c.own[k] ?? ""}`} value={c.own[k] ?? ""} placeholder={inherited} ariaLabel={`${label} ${c.name}`}
                    onSave={(v) => { if (v !== (c.own[k] ?? "")) run(() => setCharacterStateAction(sceneId, c.characterId, { ...c.own, [k]: v } as Record<string, string>)); }} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {cast.length > 0 && <p className="text-xs text-muted">ما تكتبه هنا يستمر في المشاهد التالية حتى يتغيّر.</p>}
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}

/** Camera motion, scene reference image (sent with the identities) and the scene's own audio. */
function SceneMedia({ scene }: { scene: Scene }) {
  const { pending, error, run } = useAction();
  const upload = (field: "reference_asset_id", accept: string, label: string) => (
    <form className="flex flex-wrap items-center gap-2" action={(fd) => run(() => setSceneMediaAction(scene.id, field, fd))}>
      <input type="file" name="file" accept={accept} className="text-xs" aria-label={label} />
      <button className="btn btn-sm" disabled={pending}>ارفعي</button>
    </form>
  );
  return (
    <div className="mt-3 grid grid-cols-1 gap-3 rounded-lg border border-line p-3 sm:grid-cols-3">
      <div>
        <label className="label" htmlFor={`mo-${scene.id}`}>حركة الكاميرا</label>
        <select id={`mo-${scene.id}`} className="field py-1" value={scene.motion} disabled={pending}
          onChange={(e) => run(() => updateSceneAction(scene.id, { motion: e.target.value }))}>
          {MOTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <div className="label">صورة مرجعية للمشهد</div>
        {scene.reference_asset_id ? (
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/assets/${scene.reference_asset_id}`} alt="" className="h-12 w-12 rounded object-cover" />
            <button className="btn btn-sm" disabled={pending} onClick={() => run(() => setSceneMediaAction(scene.id, "reference_asset_id", null))}>إزالة</button>
          </div>
        ) : upload("reference_asset_id", "image/*", "صورة مرجعية للمشهد")}
      </div>
      <div className="space-y-1">
        <div className="label">صوت المشهد (تعليق أو مؤثر)</div>
        {scene.audio_asset_id ? (
          <div className="flex items-center gap-2">
            <audio src={`/api/assets/${scene.audio_asset_id}`} controls className="h-8 w-full" />
            <button className="btn btn-sm" disabled={pending} onClick={() => run(() => setSceneMediaAction(scene.id, "audio_asset_id", null))}>إزالة</button>
          </div>
        ) : <SceneAudioPicker projectId={scene.project_id} sceneId={scene.id} />}
      </div>
      {error && <p className="text-sm text-danger sm:col-span-3" role="alert">{error}</p>}
    </div>
  );
}

function OutfitPicker({ projectId, sceneId, position, sceneCount, cast, outfits }: {
  projectId: string; sceneId: string; position: number; sceneCount: number; cast: SceneCast; outfits: { id: string; name: string }[];
}) {
  const { pending, error, run } = useAction();
  const [to, setTo] = useState(sceneCount);
  const eff = cast.effectiveOutfit;
  if (outfits.length === 0) {
    return <p className="text-xs text-muted">لا أزياء محفوظة لـ{cast.name}. <Link className="text-primary underline" href={`/characters/${cast.characterId}`}>أضيفي زيًا</Link> لتثبيته على المشاهد.</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="label m-0" htmlFor={`o-${sceneId}-${cast.characterId}`}>الزي</label>
      <select id={`o-${sceneId}-${cast.characterId}`} className="field w-auto py-1" disabled={pending} value={cast.outfitId ?? ""}
        onChange={(e) => run(() => setSceneOutfitAction(sceneId, cast.characterId, e.target.value || null))}>
        <option value="">{eff && eff.fromPosition !== position ? `يستمر من المشهد ${eff.fromPosition}: ${eff.name}` : "دون زي محدد"}</option>
        {outfits.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      {cast.outfitId && (
        <span className="flex items-center gap-1">
          <span>ثبّتيه حتى المشهد</span>
          <input type="number" className="field w-16 py-1" min={position} max={sceneCount} value={to} aria-label="ثبّت الزي حتى المشهد"
            onChange={(e) => setTo(Number(e.target.value))} />
          <button className="btn btn-sm" disabled={pending} onClick={() => run(() => lockOutfitForScenesAction(projectId, cast.characterId, cast.outfitId!, position, to))}>
            🔒 ثبّت
          </button>
        </span>
      )}
      {error && <p className="w-full text-danger" role="alert">{error}</p>}
    </div>
  );
}

function ShotsEditor({ sceneId, shots }: { sceneId: string; shots: Shot[] }) {
  const { pending, error, run } = useAction();
  return (
    <div className="mt-3 space-y-2">
      <div className="label">اللقطات</div>
      <ol className="space-y-2">
        {shots.map((sh) => (
          <li key={sh.id} className="grid grid-cols-[2rem_1fr] items-start gap-2 sm:grid-cols-[2rem_2fr_1fr_5rem_auto]">
            <span className="pt-2 text-sm text-muted">{sh.position}</span>
            <Field key={`d-${sh.description}`} value={sh.description} ariaLabel={`وصف اللقطة ${sh.position}`}
              onSave={(v) => v !== sh.description && run(() => updateShotAction(sh.id, { description: v }))} />
            <Field key={`c-${sh.camera}`} value={sh.camera} ariaLabel={`كاميرا اللقطة ${sh.position}`} placeholder="الكاميرا"
              onSave={(v) => v !== sh.camera && run(() => updateShotAction(sh.id, { camera: v }))} />
            <Field key={`t-${sh.duration_sec}`} value={String(sh.duration_sec)} type="number" ariaLabel={`مدة اللقطة ${sh.position}`}
              onSave={(v) => Number(v) !== sh.duration_sec && run(() => updateShotAction(sh.id, { duration_sec: Number(v) }))} />
            <button className="btn btn-sm text-danger" disabled={pending} onClick={() => run(() => deleteShotAction(sh.id))} aria-label={`حذف اللقطة ${sh.position}`}>حذف</button>
          </li>
        ))}
      </ol>
      <button className="btn btn-sm" disabled={pending} onClick={() => run(() => addShotAction(sceneId))}>+ لقطة</button>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}
