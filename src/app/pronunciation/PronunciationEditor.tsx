"use client";

import { useState, useTransition } from "react";
import { addPronunciationAction, deletePronunciationAction, previewPronunciationAction } from "./actions";
import { useAction } from "../projects/[id]/useAction";

export default function PronunciationEditor({ entries }: { entries: { id: string; term: string; pronunciation: string }[] }) {
  const { pending, error, run } = useAction();
  const [term, setTerm] = useState("");
  const [pron, setPron] = useState("");
  const [sample, setSample] = useState("");
  const [out, setOut] = useState<string | null>(null);
  const [testing, start] = useTransition();
  return (
    <div className="space-y-4">
      <section className="card space-y-2 p-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input className="field" placeholder="الكلمة كما تُكتب" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="الكلمة" />
          <input className="field text-lg" placeholder="طريقة النطق (مشكولة)" value={pron} onChange={(e) => setPron(e.target.value)} aria-label="طريقة النطق" />
          <button className="btn btn-primary" disabled={pending}
            onClick={() => run(async () => { const r = await addPronunciationAction(term, pron); if (r.ok) { setTerm(""); setPron(""); } return r; })}>أضيفي</button>
        </div>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        {entries.length === 0 ? <p className="text-sm text-muted">لا كلمات بعد.</p> : (
          <table className="w-full text-sm">
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-t border-line">
                  <td className="py-1">{e.term}</td><td className="py-1 text-lg">{e.pronunciation}</td>
                  <td className="py-1 text-end"><button className="btn btn-sm" disabled={pending} onClick={() => run(() => deletePronunciationAction(e.id))}>حذف</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="card space-y-2 p-4">
        <h2 className="font-bold">جرّبي</h2>
        <textarea className="field" value={sample} onChange={(e) => setSample(e.target.value)} aria-label="نص التجربة" placeholder="اكتبي جملة فيها الكلمات" />
        <button className="btn btn-sm" disabled={testing} onClick={() => start(async () => setOut(await previewPronunciationAction(sample)))}>ماذا سيُنطق؟</button>
        {out !== null && <p className="rounded bg-surface-2 p-2 text-lg" data-testid="pron-out">{out}</p>}
      </section>
    </div>
  );
}
