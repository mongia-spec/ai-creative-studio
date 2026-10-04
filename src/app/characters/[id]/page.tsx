import { notFound } from "next/navigation";
import Link from "next/link";
import { getDb } from "@/db/client";
import { ATTRIBUTE_FIELDS, characterDescriptor, getCharacter, listReferences } from "@/lib/characters";
import CharacterEditor from "./CharacterEditor";

export const dynamic = "force-dynamic";

export default async function CharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const c = await getCharacter(db, id);
  if (!c) notFound();
  const [refs, usage] = await Promise.all([
    listReferences(db, id),
    db.query<{ id: string; title: string; scenes: number }>(
      `select p.id, p.title, count(*)::int scenes from scene_characters sc join scenes s on s.id=sc.scene_id
       join projects p on p.id=s.project_id where sc.character_id=$1 and p.status<>'archived' group by p.id, p.title order by p.title`, [id]),
  ]);
  return (
    <div className="space-y-4">
      <Link href="/characters" className="text-sm text-primary">→ مكتبة الشخصيات</Link>
      <CharacterEditor
        character={c}
        fields={ATTRIBUTE_FIELDS.map(([k, label]) => ({ key: k, label }))}
        references={refs.map((r) => ({ id: r.id, name: r.name }))}
        descriptor={characterDescriptor(c)}
      />
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
