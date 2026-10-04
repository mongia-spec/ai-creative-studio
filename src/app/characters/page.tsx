import Link from "next/link";
import { getDb } from "@/db/client";
import { getDefaultWorkspaceId } from "@/lib/workspace";
import { listCharacters } from "@/lib/characters";
import NewCharacterForm from "./NewCharacterForm";

export const dynamic = "force-dynamic";

export default async function CharactersPage() {
  const db = await getDb();
  const characters = await listCharacters(db, await getDefaultWorkspaceId(db));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">مكتبة الشخصيات</h1>
        <p className="text-muted">عرّف الشخصية مرة واحدة، واقفلها لتبقى ثابتة في كل المشاهد والمشاريع.</p>
      </div>
      <NewCharacterForm />
      {characters.length === 0 ? (
        <p className="card p-6 text-center text-muted">لا توجد شخصيات بعد.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {characters.map((c) => (
            <li key={c.id}>
              <Link href={`/characters/${c.id}`} className="card flex h-full gap-3 p-3 hover:border-primary">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                  {c.cover_asset_id && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/assets/${c.cover_asset_id}`} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 font-bold">
                    {c.name} {c.locked && <span className="rounded-full bg-secondary px-2 text-xs text-white">🔒 مقفلة</span>}
                  </h2>
                  <p className="line-clamp-2 text-sm text-muted">{c.description || "بلا وصف"}</p>
                  <p className="text-xs text-muted">{c.reference_count} صور مرجعية</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
