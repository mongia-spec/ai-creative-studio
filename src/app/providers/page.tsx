import { listProviders } from "@/providers/registry";
import { SUPPORT_KEYS, type SupportKey, type SupportLevel } from "@/providers/types";

export const dynamic = "force-dynamic";

const KEY_LABEL: Record<SupportKey, string> = {
  identityConsistency: "ثبات الهوية",
  referenceImages: "الصور المرجعية",
  voiceConsistency: "ثبات الصوت",
  talkingAvatar: "شخصية متحدثة",
  lipSync: "مزامنة الشفاه",
};
const LEVEL: Record<SupportLevel, { label: string; cls: string }> = {
  none: { label: "غير مدعوم", cls: "bg-surface-2 text-muted" },
  simulated: { label: "محاكاة تجريبية", cls: "bg-warn/20" },
  partial: { label: "جزئي، غير مضمون", cls: "bg-secondary/15" },
  full: { label: "مدعوم", cls: "bg-primary text-primary-ink" },
};
const CAP_LABEL: Record<string, string> = {
  text: "النص والإجابات", image: "الصور", video: "الفيديو", voice: "الصوت", stt: "تحويل الكلام لنص", lipsync: "الشخصية المتحدثة", music: "الموسيقى",
};

export default function ProvidersPage() {
  const providers = listProviders();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">المزوّدات وما تدعمه فعلًا</h1>
      <p className="text-muted">
        كل مزوّد يعلن ما يدعمه، ولا نعرض دعمًا لم يُعلنه. «مدعوم» تعني أن المزوّد نفسه يضمنها، و«جزئي» تعني أفضل محاولة دون ضمان.
        لا يوجد مزوّد يضمن ثبات الوجه أو الصوت بنسبة 100٪ إلا إذا أعلن ذلك صراحة.
      </p>
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-surface-2">
            <tr>
              <th className="p-2 text-start">المزوّد</th>
              <th className="p-2 text-start">القدرة</th>
              {SUPPORT_KEYS.map((k) => <th key={k} className="p-2 text-start">{KEY_LABEL[k]}</th>)}
              <th className="p-2 text-start">اللهجات المعلنة</th>
              <th className="p-2 text-start">السعر</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((p) => (
              <tr key={p.id} className="border-t border-line align-top">
                <td className="p-2 font-semibold">{p.name}{p.isMock && <span className="ms-1 rounded bg-surface-2 px-1 text-xs">تجريبي</span>}</td>
                <td className="p-2">{CAP_LABEL[p.capability] ?? p.capability}</td>
                {SUPPORT_KEYS.map((k) => {
                  const s = p.support?.[k];
                  if (!s) return <td key={k} className="p-2 text-muted">—</td>;
                  return (
                    <td key={k} className="p-2">
                      <span className={`rounded px-1.5 py-0.5 text-xs ${LEVEL[s.level].cls}`}>{LEVEL[s.level].label}</span>
                      <p className="mt-1 text-xs text-muted">{s.note}</p>
                    </td>
                  );
                })}
                <td className="p-2">{p.dialects.length ? p.dialects.join("، ") : <span className="text-muted">لا شيء</span>}</td>
                <td className="p-2">{p.pricing.unitPriceUsd === 0 ? "مجاني" : `$${p.pricing.unitPriceUsd} / ${p.pricing.unitType}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="card space-y-2 p-4 text-sm">
        <h2 className="font-bold">إضافة مزوّد حقيقي</h2>
        <p>
          كل المزوّدات الحالية تجريبية ومجانية وتعمل على هذا الجهاز. إضافة مزوّد حقيقي (صور بوجه ثابت، صوت عربي بلهجة محددة، مزامنة شفاه)
          تحتاج حسابًا ومفتاحًا وقد تكون مدفوعة، فلا تُضاف إلا بعد عرض التكلفة والترخيص وما يدعمه فعلًا، وموافقتك الصريحة.
        </p>
        <p className="text-muted">بعد الإضافة يظهر هنا تلقائيًا بمستوى الدعم الذي يعلنه، ويُستخدم في المسارات نفسها دون تغيير المشاريع.</p>
      </section>
    </div>
  );
}
