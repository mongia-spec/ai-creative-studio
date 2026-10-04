import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { getCharacter, getIdentityPack, listKnowledge } from "@/lib/characters";
import { DIALECTS } from "@/config/character-fields";
import { getProvider } from "@/providers/registry";
import AskPanel from "@/app/components/AskPanel";
import VoiceTest from "./VoiceTest";

export const dynamic = "force-dynamic";

export default async function CharacterTestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const c = await getCharacter(db, id);
  if (!c) notFound();
  const pack = await getIdentityPack(db, id);
  const knowledge = await listKnowledge(db, id);
  const voiceProv = getProvider("voice").info;
  const lipProv = getProvider("lipsync").info;
  const dialectLabel = DIALECTS.find(([k]) => k === pack.voice.dialect)?.[1] ?? "غير محددة";
  const dialectOk = !pack.voice.dialect || voiceProv.dialects.includes(pack.voice.dialect);
  const check = (ok: boolean, label: string, hint?: string) => (
    <li className="flex gap-2"><span>{ok ? "✅" : "⚠️"}</span><span>{label}{hint && <span className="block text-xs text-muted">{hint}</span>}</span></li>
  );
  return (
    <div className="space-y-4">
      <Link href={`/characters/${id}`} className="text-sm text-primary">→ {c.name}</Link>
      <h1 className="text-2xl font-bold">وضع اختبار {c.name}</h1>
      <p className="text-muted">جرّبي الأسئلة والصوت واللهجة والشخصية المتحدثة هنا، دون إعادة توليد أي فيلم أو مشهد.</p>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="card space-y-3 p-4">
          <h2 className="font-bold">اسأل {c.name}</h2>
          {knowledge.length === 0 && (
            <p className="rounded-lg bg-warn/20 p-3 text-sm">
              لا معرفة لهذه الشخصية بعد، فستعيد كل سؤال بلطف. <Link className="text-primary underline" href={`/characters/${id}`}>أضيفي قاعدة المعرفة</Link>.
            </p>
          )}
          <AskPanel characterId={id} characterName={c.name} avatarAssetId={pack.primaryAssetId} channel="test" showSources />
        </section>
        <aside className="space-y-4">
          <section className="card space-y-2 p-4 text-sm">
            <h2 className="font-bold">فحص ثبات الهوية</h2>
            <ul className="space-y-1">
              {check(!!pack.primaryAssetId, "صورة رئيسية محددة", "هي الوجه الذي يتحدث في كل إجابة.")}
              {check(c.locked, c.locked ? "الشخصية مقفلة" : "الشخصية غير مقفلة", "القفل يمنع تغيير الشكل بالخطأ.")}
              {check(pack.voice.locked, pack.voice.locked ? "الصوت مقفل" : "الصوت غير مقفل", "القفل يُبقي الصوت نفسه في كل المشاهد.")}
              {check(knowledge.length > 0, `قاعدة المعرفة: ${knowledge.length} مدخلات`)}
              {check(dialectOk, `اللهجة: ${dialectLabel}`, dialectOk ? undefined : `${voiceProv.name} لا يعلن دعمها، فلن يُدّعى نطقها.`)}
            </ul>
            <p className="text-xs text-muted">
              الوجه: {lipProv.support?.identityConsistency?.note} الشفاه: {lipProv.support?.lipSync?.note}
            </p>
            <p className="text-xs text-muted">الصوت: {voiceProv.support?.voiceConsistency?.note}</p>
          </section>
          <section className="card space-y-2 p-4 text-sm">
            <h2 className="font-bold">الصوت المحفوظ</h2>
            <p>المزوّد: {pack.voice.provider} · السرعة {pack.voice.speed} · الطبقة {pack.voice.pitch}{pack.voice.tone && ` · ${pack.voice.tone}`}</p>
            <VoiceTest characterId={id} />
          </section>
        </aside>
      </div>
    </div>
  );
}
