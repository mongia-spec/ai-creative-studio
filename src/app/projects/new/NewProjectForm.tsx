"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { PlatformPreset } from "@/config/platform-presets";
import type { StartOption } from "@/config/start-options";
import { createProjectAction } from "../../actions";
import { FeatureBadge } from "../../components";

export default function NewProjectForm(props: { options: StartOption[]; presets: PlatformPreset[]; styles: { id: string; label: string }[] }) {
  const [startType, setStartType] = useState("idea");
  const [presetId, setPresetId] = useState(props.presets[0].id);
  const preset = props.presets.find((p) => p.id === presetId)!;
  const [state, action, pending] = useActionState(createProjectAction, null);

  return (
    <form action={action} className="space-y-6">
      <section className="card p-4">
        <h2 className="mb-3 font-bold">1. من أين تبدأ؟</h2>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {props.options.map((o) => {
            const working = o.status === "WORKING";
            const selected = startType === o.id;
            if (o.href) {
              return (
                <Link key={o.id} href={o.href} className="flex flex-col gap-1 rounded-xl border border-line p-3 hover:border-primary">
                  <span className="flex items-center justify-between gap-1 font-semibold">{o.label} <FeatureBadge status={o.status} /></span>
                  {o.hint && <span className="text-xs text-muted">{o.hint}</span>}
                </Link>
              );
            }
            return (
              <label
                key={o.id}
                className={`flex flex-col gap-1 rounded-xl border p-3 ${working ? "cursor-pointer" : "cursor-not-allowed opacity-60"} ${selected ? "border-primary bg-primary/5" : "border-line"}`}
              >
                <input type="radio" name="startType" value={o.id} className="sr-only" disabled={!working}
                  checked={selected} onChange={() => setStartType(o.id)} />
                <span className="flex items-center justify-between gap-1 font-semibold">{o.label} <FeatureBadge status={o.status} /></span>
                {o.hint && <span className="text-xs text-muted">{o.hint}</span>}
              </label>
            );
          })}
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-bold">2. {startType === "idea" ? "اكتب فكرتك" : "الصق النص"}</h2>
        <textarea name="inputText" required minLength={3} rows={startType === "idea" ? 3 : 10} className="field"
          placeholder={startType === "idea" ? "مثال: قصة سينمائية عن طفل يكتشف مدينة قديمة" : "الصق قصة أو مقالًا أو درسًا أو إعلانًا…"} />
        <div>
          <label className="label" htmlFor="title">عنوان المشروع (اختياري)</label>
          <input id="title" name="title" className="field" placeholder="يُقترح تلقائيًا إن تركته فارغًا" />
        </div>
      </section>

      <section className="card grid gap-3 p-4 sm:grid-cols-3">
        <h2 className="font-bold sm:col-span-3">3. المنصة والمدة والأسلوب</h2>
        <div>
          <label className="label" htmlFor="platformPreset">المنصة</label>
          <select id="platformPreset" name="platformPreset" className="field" value={presetId} onChange={(e) => setPresetId(e.target.value)}>
            {props.presets.map((p) => <option key={p.id} value={p.id}>{p.label} ({p.aspectRatio})</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="targetDurationSec">المدة بالثواني (حتى {preset.maxDurationSec})</label>
          <input key={presetId} id="targetDurationSec" name="targetDurationSec" type="number" min={5} max={preset.maxDurationSec}
            defaultValue={preset.defaultDurationSec} className="field" required />
        </div>
        <div>
          <label className="label" htmlFor="style">الأسلوب البصري</label>
          <select id="style" name="style" className="field">
            {props.styles.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      </section>

      {state && !state.ok && <p className="rounded-lg bg-danger/10 p-3 text-danger" role="alert">{state.error}</p>}
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>{pending ? "جارٍ الإنشاء…" : "أنشئ المشروع وولّد النص"}</button>
        <span className="text-sm text-muted">التوليد الآن بمزوّد تجريبي محلي، دون أي تكلفة.</span>
      </div>
    </form>
  );
}
