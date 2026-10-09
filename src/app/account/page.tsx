import { getDb } from "@/db/client";
import { getDefaultWorkspaceId } from "@/lib/workspace";
import { creditHistory, workspaceUsage } from "@/lib/usage";
import { PLANS } from "@/config/plans";
import { FeatureBadge } from "../components";

export const dynamic = "force-dynamic";

const CAP: Record<string, string> = { text: "نص وإجابات", image: "صور", video: "فيديو", voice: "صوت", stt: "تحويل كلام", lipsync: "شخصية متحدثة", music: "موسيقى" };
const JOB: Record<string, string> = { queued: "بالانتظار", running: "قيد التنفيذ", succeeded: "ناجحة", failed: "فاشلة", cancelled: "ملغاة" };

export default async function AccountPage() {
  const db = await getDb();
  const ws = await getDefaultWorkspaceId(db);
  const [u, history] = await Promise.all([workspaceUsage(db, ws), creditHistory(db, ws)]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">الحساب والاستخدام</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <section className="card p-4"><div className="label">الخطة الحالية</div><p className="text-xl font-bold">{u.plan.label}</p></section>
        <section className="card p-4"><div className="label">الرصيد</div><p className="text-xl font-bold">{u.balance} رصيد</p>
          <p className="text-xs text-muted">لا يُخصم شيء الآن: كل المزوّدات تجريبية ومجانية.</p></section>
        <section className="card p-4"><div className="label">تكلفة المزوّدات هذا الشهر</div><p className="text-xl font-bold">${u.totalCostUsd.toFixed(2)}</p></section>
      </div>
      <section className="card space-y-2 p-4">
        <h2 className="font-bold">الاستخدام هذا الشهر</h2>
        {u.byCapability.length === 0 ? <p className="text-sm text-muted">لا استخدام بعد.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-muted"><th className="text-start">القدرة</th><th className="text-start">الاستدعاءات</th><th className="text-start">منها تجريبية</th><th className="text-start">الكمية</th><th className="text-start">التكلفة</th></tr></thead>
            <tbody>{u.byCapability.map((r) => (
              <tr key={r.capability} className="border-t border-line"><td>{CAP[r.capability] ?? r.capability}</td><td>{r.calls}</td><td>{r.mock}</td><td>{Math.round(r.units)}</td><td>${r.cost.toFixed(2)}</td></tr>
            ))}</tbody>
          </table>
        )}
        <p className="text-xs text-muted">إجابات أُعيد استخدامها من الذاكرة المؤقتة دون تكلفة: {u.cachedAnswers}</p>
      </section>
      <section className="card space-y-2 p-4">
        <h2 className="font-bold">لوحة الإدارة</h2>
        <ul className="grid gap-2 text-sm sm:grid-cols-4">
          <li>المشاريع: <b>{u.counts.projects}</b></li>
          <li>الشخصيات: <b>{u.counts.characters}</b></li>
          <li>الفيديوهات المصدّرة: <b>{u.counts.exports}</b></li>
          <li>التخزين: <b>{(u.counts.storage / 1024 / 1024).toFixed(1)} م.ب</b></li>
        </ul>
        <p className="text-sm">المهام: {u.jobs.map((j) => `${JOB[j.status] ?? j.status} ${j.n}`).join(" · ") || "لا مهام"}</p>
      </section>
      <section className="card space-y-3 p-4">
        <div className="flex items-center justify-between"><h2 className="font-bold">الخطط</h2><FeatureBadge status="COMING_SOON" /></div>
        <p className="text-sm text-muted">بوابة الدفع غير مفعّلة، ولم تُحدَّد الأسعار بعد. تُفعَّل بعد موافقتك واختيار مزوّد الدفع.</p>
        <div className="grid gap-3 md:grid-cols-3">
          {PLANS.map((p) => (
            <div key={p.id} className={`rounded-xl border p-3 ${p.id === u.plan.id ? "border-primary" : "border-line"}`}>
              <p className="font-bold">{p.label}{p.id === u.plan.id && " · الحالية"}</p>
              <p className="text-sm">{p.monthlyCredits} رصيد شهريًا · تصدير حتى {Math.round(p.maxExportSec / 60)} دقيقة</p>
              <p className="text-sm">{p.commercialUse ? "✅ استخدام تجاري" : "استخدام شخصي"}{p.watermark ? " · علامة مائية" : ""}</p>
              <ul className="list-disc ps-5 text-xs text-muted">{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
            </div>
          ))}
        </div>
      </section>
      {history.length > 0 && (
        <section className="card p-4 text-sm"><h2 className="mb-1 font-bold">سجل الرصيد</h2>
          <ul>{history.map((h, k) => <li key={k}>{Number(h.delta) > 0 ? "+" : ""}{Number(h.delta)} · {h.reason}</li>)}</ul></section>
      )}
    </div>
  );
}
