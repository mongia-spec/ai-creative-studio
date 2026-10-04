import Link from "next/link";
import { getDb } from "@/db/client";
import { getDefaultWorkspaceId } from "@/lib/workspace";
import { listProjects } from "@/lib/projects";
import { getPreset } from "@/config/platform-presets";
import { ProjectStatus } from "./components";

export const dynamic = "force-dynamic";

export default async function Home() {
  const db = await getDb();
  const projects = await listProjects(db, await getDefaultWorkspaceId(db));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">مشاريعي</h1>
          <p className="text-muted">من الفكرة إلى النص ولوحة القصة، قبل أي توليد مكلف.</p>
        </div>
        <Link href="/projects/new" className="btn btn-primary">+ مشروع جديد</Link>
      </div>

      {projects.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="mb-4 text-lg">لا توجد مشاريع بعد.</p>
          <Link href="/projects/new" className="btn btn-primary">ابدأ أول مشروع</Link>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`} className="card block h-full p-4 hover:border-primary">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h2 className="font-bold">{p.title}</h2>
                  <ProjectStatus status={p.status} />
                </div>
                <p className="text-sm text-muted">
                  {getPreset(p.platform_preset).label} · {p.target_duration_sec} ثانية · {p.scene_count} مشاهد
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
