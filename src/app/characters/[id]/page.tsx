import { notFound } from "next/navigation";
import Link from "next/link";
import { getDb } from "@/db/client";
import { ATTRIBUTE_FIELDS, characterDescriptor, getCharacter, getVoice, listKnowledge, listOutfits, listReferences } from "@/lib/characters";
import { listProviders } from "@/providers/registry";
import CharacterEditor from "./CharacterEditor";
import { KnowledgePanel, OutfitsPanel, VoicePanel } from "./IdentityPanels";

export const dynamic = "force-dynamic";

export default async function CharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const c = await getCharacter(db, id);
  if (!c) notFound();
  const [refs, voice, outfits, knowledge, usage] = await Promise.all([
    listReferences(db, id),
    getVoice(db, id),
    listOutfits(db, id),
    listKnowledge(db, id),
    db.query<{ id: string; title: string; scenes: number }>(
      `select p.id, p.title, count(*)::int scenes from scene_characters sc join scenes s on s.id=sc.scene_id
       join projects p on p.id=s.project_id where sc.character_id=$1 and p.status<>'archived' group by p.id, p.title order by p.title`, [id]),
  ]);
  const voiceProviders = listProviders().filter((p) => p.capability === "voice")
    .map((p) => ({ id: p.id, name: p.name, isMock: p.isMock, dialects: p.dialects, note: p.support?.voiceConsistency?.note }));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/characters" className="text-sm text-primary">→ مكتبة الشخصيات</Link>
        <div className="flex gap-2">
          <Link href={`/characters/${id}/test`} className="btn btn-sm btn-primary">🧪 اختبري الشخصية</Link>
          <Link href={`/talking-photo?character=${id}`} className="btn btn-sm">🗣️ صورة متحدثة</Link>
        </div>
      </div>
      <CharacterEditor
        character={c}
        fields={ATTRIBUTE_FIELDS.map(([k, label]) => ({ key: k, label }))}
        references={refs.map((r) => ({ id: r.id, name: r.name, role: r.role }))}
        descriptor={characterDescriptor(c)}
      />
      <VoicePanel characterId={id} voice={voice} providers={voiceProviders} />
      <OutfitsPanel characterId={id} outfits={outfits} />
      <KnowledgePanel characterId={id} entries={knowledge} />
      <section className="card p-4">
        <h2 className="mb-2 font-bold">تظهر في</h2>
        {usage.length === 0 ? <p className="text-sm text-muted">لم تُربط بأي مشهد بعد.</p> : (
          <ul className="text-sm">
            {usage.map((u) => <li key={u.id}><Link className="text-primary underline" href={`/projects/${u.id}`}>{u.title}</Link> · {u.scenes} مشاهد</li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
