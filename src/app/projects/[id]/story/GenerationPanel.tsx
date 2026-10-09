"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveAndRunAction, planAction } from "@/app/generation-actions";
import type { Plan, Quality, RunReport } from "@/lib/generation";

const usd = (n: number) => `${n.toFixed(2)}$`;
const KIND = { character: "صور الشخصيات", keyframe: "الإطارات الأولى", video: "حركة اللقطات" } as const;

/** Price first, then a cap the user sets; generation never passes the cap without a new approval. */
export default function GenerationPanel({ projectId, initialQuality }: { projectId: string; initialQuality: Quality }) {
  const router = useRouter();
  const [quality, setQuality] = useState<Quality>(initialQuality);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [cap, setCap] = useState("");
  const [report, setReport] = useState<RunReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => { start(async () => { const r = await planAction(projectId, quality); if (r.ok) setPlan(r.plan); else setError(r.error); }); }, [projectId, quality]);
  const sums = plan ? (Object.keys(KIND) as (keyof typeof KIND)[]).map((k) => {
    const its = plan.items.filter((i) => i.kind === k);
    return { k, n: its.length, cost: its.reduce((a, i) => a + i.costUsd, 0) };
  }).filter((x) => x.n) : [];
  const capNum = Number(cap);
  const canRun = plan && plan.items.length > 0 && (!plan.live || (cap !== "" && capNum >= 0));

  return (
    <section className="card space-y-3 p-4" data-testid="generation-panel">
      <h2 className="font-bold">✨ توليد الشخصيات والمشاهد والحركة</h2>
      <p className="text-sm text-muted">يولّد فقط الناقص: صورة لكل شخصية بلا صورة، إطارًا أول لكل لقطة بلا صورة، ثم حركة اللقطة. الأصول الموجودة لا يُعاد توليدها.</p>
      <label className="flex items-center gap-2 text-sm">الجودة
        <select className="field w-auto py-1" value={quality} onChange={(e) => setQuality(e.target.value as Quality)} aria-label="جودة التوليد">
          <option value="draft">مسودة 480p (الأرخص)</option><option value="standard">قياسي 720p</option>
        </select>
      </label>
      {plan && (
        <div className="space-y-2 text-sm">
          <p>المزوّدون: {plan.providers.map((p) => `${p.name}${p.isMock ? " (تجريبي مجاني)" : ""}`).join(" · ")}</p>
          {plan.items.length === 0 ? <p>لا شيء ناقص: كل اللقطات لها صور وحركة.</p> : (
            <table className="w-full text-start" data-testid="plan-table">
              <tbody>
                {sums.map((x) => <tr key={x.k}><td className="py-0.5">{KIND[x.k]} ({x.n})</td><td className="tabular-nums">{usd(x.cost)}</td></tr>)}
                <tr><td className="py-0.5">احتياط لإعادة نصف المحاولات</td><td className="tabular-nums">{usd(plan.retryUsd)}</td></tr>
                <tr className="font-bold"><td>الإجمالي المتوقع</td><td className="tabular-nums" data-testid="plan-total">{usd(plan.totalUsd)}</td></tr>
              </tbody>
            </table>
          )}
          {plan.live ? (
            <label className="flex flex-wrap items-center gap-2">حدّ الإنفاق لهذه العملية ($)
              <input type="number" min={0} step={0.5} className="field w-28 py-1" value={cap} onChange={(e) => setCap(e.target.value)} aria-label="حد الإنفاق" />
              <span className="text-xs text-muted">يتوقف التوليد قبل تجاوزه، ولا يكمل إلا بموافقة جديدة.</span>
            </label>
          ) : <p className="rounded bg-warn/20 p-2">الوضع الحالي تجريبي ومجاني: الصور مؤقتة والحركة دفع كاميرا فقط، وليست حركة ذكاء اصطناعي. يُفعَّل المزوّد الحقيقي بعد موافقتك ومفتاحه.</p>}
        </div>
      )}
      <button className="btn btn-primary" disabled={pending || !canRun} onClick={() => plan && start(async () => {
        setError(null); setReport(null);
        const r = await approveAndRunAction(projectId, plan.hash, plan.live ? capNum : 0, quality);
        if (r.ok) setReport(r.report); else setError(r.error);
        const np = await planAction(projectId, quality); if (np.ok) setPlan(np.plan);
        router.refresh();
      })}>{pending ? "جارٍ العمل…" : plan?.live ? "أوافق على التكلفة وأبدأ التوليد" : "ولّدي (تجريبي مجاني)"}</button>
      {report && (
        <div className="text-sm" role="status" data-testid="run-report">
          <p>✓ أُنجز {report.done.length} عناصر · المنفق: {usd(report.spentUsd)}</p>
          {report.message && <p className="text-danger">{report.message}</p>}
        </div>
      )}
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </section>
  );
}
