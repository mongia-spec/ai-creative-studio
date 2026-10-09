"use client";

import { useState } from "react";
import type { Choice, Interaction, InteractiveSettings } from "@/lib/interactive";
import type { Tier } from "@/lib/conversation";
import { addInteractionAction, deleteInteractionAction, saveSettingsAction } from "./actions";
import { useAction } from "../useAction";

const KIND: Record<Interaction["kind"], string> = { question: "سؤال باختيارات", branch: "تفرّع (اختيار المسار)", hotspot: "نقطة تفاعلية على الصورة" };
const TIER: Record<Tier, string> = { text: "نص فقط", voice: "نص وصوت", avatar: "شخصية متحدثة" };

function Settings({ projectId, settings, characters }: { projectId: string; settings: InteractiveSettings; characters: { id: string; name: string }[] }) {
  const { pending, error, run } = useAction();
  const [s, setS] = useState(settings);
  const toggleChar = (id: string) => setS({ ...s, askable: s.askable.includes(id) ? s.askable.filter((x) => x !== id) : [...s.askable, id] });
  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-bold">ضوابط المنشئ</h2>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.allowAsk} onChange={(e) => setS({ ...s, allowAsk: e.target.checked })} /> يستطيع المشاهد سؤال الشخصيات</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.allowMic} onChange={(e) => setS({ ...s, allowMic: e.target.checked })} /> السؤال بالصوت (الميكروفون)</label>
      <div>
        <label className="label" htmlFor="ix-tier">أعلى مستوى للإجابة (للتحكم في التكلفة)</label>
        <select id="ix-tier" className="field w-auto" value={s.maxTier} onChange={(e) => setS({ ...s, maxTier: e.target.value as Tier })}>
          {(Object.keys(TIER) as Tier[]).map((k) => <option key={k} value={k}>{TIER[k]}</option>)}
        </select>
      </div>
      {characters.length > 0 && (
        <div className="space-y-1 text-sm">
          <div className="label">الشخصيات التي تستقبل الأسئلة (بلا تحديد = الجميع)</div>
          <div className="flex flex-wrap gap-2">
            {characters.map((c) => (
              <button key={c.id} type="button" aria-pressed={s.askable.includes(c.id)} onClick={() => toggleChar(c.id)}
                className={`rounded-full border px-3 py-0.5 ${s.askable.includes(c.id) ? "border-primary bg-primary text-primary-ink" : "border-line"}`}>{c.name}</button>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs text-muted">الردود الآمنة مفعّلة دائمًا: الأسئلة الحساسة أو طلب المعلومات الشخصية تحصل على رد ثابت لطيف يوجّه إلى شخص كبير موثوق.</p>
      <button className="btn btn-primary" disabled={pending} onClick={() => run(() => saveSettingsAction(projectId, s))}>احفظي الضوابط</button>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </section>
  );
}

type Row = { label: string; correct: boolean; goto: string; feedback: string };
const emptyRow = (): Row => ({ label: "", correct: false, goto: "", feedback: "" });

function AddForm({ projectId, scene }: { projectId: string; scene: { id: string; duration: number } }) {
  const { pending, error, run } = useAction();
  const [kind, setKind] = useState<Interaction["kind"]>("question");
  const [at, setAt] = useState(Math.max(0, Math.round(scene.duration - 1)));
  const [prompt, setPrompt] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow()]);
  const [xy, setXy] = useState({ x: 50, y: 50 });
  const setRow = (i: number, p: Partial<Row>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const submit = () => {
    const choices: Choice[] = kind === "hotspot"
      ? [{ label: rows[0].label, feedback: rows[0].feedback, x: xy.x, y: xy.y }]
      : rows.map((r) => ({ label: r.label, correct: r.correct, gotoPosition: r.goto ? Number(r.goto) : null, feedback: r.feedback }));
    run(async () => {
      const r = await addInteractionAction(projectId, scene.id, { kind, atSec: at, prompt, choices });
      if (r.ok) { setPrompt(""); setRows([emptyRow(), emptyRow()]); }
      return r;
    });
  };
  return (
    <div className="space-y-2 rounded-lg bg-surface-2 p-3 text-sm">
      <div className="flex flex-wrap gap-2">
        <select className="field w-auto py-1" value={kind} onChange={(e) => setKind(e.target.value as Interaction["kind"])} aria-label="النوع">
          {(Object.keys(KIND) as Interaction["kind"][]).map((k) => <option key={k} value={k}>{KIND[k]}</option>)}
        </select>
        <label className="flex items-center gap-1">عند الثانية
          <input type="number" min={0} max={scene.duration} step={0.5} className="field w-20 py-1" value={at} onChange={(e) => setAt(Number(e.target.value))} aria-label="عند الثانية" />
        </label>
      </div>
      <input className="field" value={prompt} onChange={(e) => setPrompt(e.target.value)} aria-label="نص السؤال"
        placeholder={kind === "hotspot" ? "عنوان قصير يظهر عند النقطة" : kind === "branch" ? "ماذا يختار البطل الآن؟" : "سؤال عن هذا المشهد"} />
      {kind === "hotspot" ? (
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
          <input className="field" placeholder="اسم الشيء" value={rows[0].label} onChange={(e) => setRow(0, { label: e.target.value })} aria-label="اسم الشيء" />
          <input className="field" placeholder="المعلومة التي تظهر" value={rows[0].feedback} onChange={(e) => setRow(0, { feedback: e.target.value })} aria-label="المعلومة" />
          <label className="flex items-center gap-1">س٪<input type="number" className="field w-16 py-1" value={xy.x} onChange={(e) => setXy({ ...xy, x: Number(e.target.value) })} aria-label="الموضع الأفقي" /></label>
          <label className="flex items-center gap-1">ص٪<input type="number" className="field w-16 py-1" value={xy.y} onChange={(e) => setXy({ ...xy, y: Number(e.target.value) })} aria-label="الموضع العمودي" /></label>
        </div>
      ) : (
        <>
          {rows.map((r, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[2fr_auto_1fr_2fr]">
              <input className="field py-1" placeholder={`الخيار ${i + 1}`} value={r.label} onChange={(e) => setRow(i, { label: e.target.value })} aria-label={`الخيار ${i + 1}`} />
              {kind === "question"
                ? <label className="flex items-center gap-1"><input type="radio" name="correct" checked={r.correct} onChange={() => setRows(rows.map((x, k) => ({ ...x, correct: k === i })))} /> صحيح</label>
                : <span />}
              <input className="field py-1" type="number" min={1} placeholder={kind === "branch" ? "ينتقل لمشهد" : "انتقال (اختياري)"} value={r.goto}
                onChange={(e) => setRow(i, { goto: e.target.value })} aria-label={`مشهد الانتقال ${i + 1}`} />
              <input className="field py-1" placeholder="تعليق بعد الاختيار (اختياري)" value={r.feedback} onChange={(e) => setRow(i, { feedback: e.target.value })} aria-label={`تعليق ${i + 1}`} />
            </div>
          ))}
          {rows.length < 4 && <button type="button" className="btn btn-sm" onClick={() => setRows([...rows, emptyRow()])}>+ خيار</button>}
        </>
      )}
      <button className="btn btn-sm btn-primary" disabled={pending} onClick={submit}>أضيفي</button>
      {error && <p className="text-danger" role="alert">{error}</p>}
    </div>
  );
}

export default function InteractiveEditor(props: {
  projectId: string; scenes: { id: string; position: number; title: string; duration: number }[]; characters: { id: string; name: string }[];
  settings: InteractiveSettings; interactions: Interaction[]; stats: Record<string, { answers: number; correct: number }>;
}) {
  const { pending, run } = useAction();
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
      <Settings projectId={props.projectId} settings={props.settings} characters={props.characters} />
      <section className="space-y-3">
        {props.scenes.map((s) => {
          const items = props.interactions.filter((i) => i.scene_id === s.id);
          return (
            <details key={s.id} className="card p-3" open={items.length > 0}>
              <summary className="cursor-pointer font-semibold">المشهد {s.position}: {s.title} <span className="text-xs text-muted">({items.length} تفاعلات)</span></summary>
              <ul className="my-2 space-y-2">
                {items.map((i) => {
                  const st = props.stats[i.id];
                  return (
                    <li key={i.id} className="rounded border border-line p-2 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <span><b>{KIND[i.kind]}</b> عند {i.at_sec} ث: {i.prompt}</span>
                        <button className="btn btn-sm" disabled={pending} onClick={() => run(() => deleteInteractionAction(props.projectId, i.id))}>حذف</button>
                      </div>
                      <ul className="ps-4 text-xs text-muted">
                        {i.choices.map((c, k) => <li key={k}>{c.correct ? "✅ " : "• "}{c.label}{c.gotoPosition ? ` ← المشهد ${c.gotoPosition}` : ""}{c.feedback ? ` · ${c.feedback}` : ""}</li>)}
                      </ul>
                      {st && <p className="text-xs">الإجابات: {st.answers}{i.kind === "question" ? ` · الصحيحة: ${st.correct}` : ""}</p>}
                    </li>
                  );
                })}
              </ul>
              <AddForm projectId={props.projectId} scene={s} />
            </details>
          );
        })}
      </section>
    </div>
  );
}
