import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { getProject } from "@/lib/projects";
import { listScenes } from "@/lib/scenes";
import { getProjectMemory } from "@/lib/scene-memory";
import { getSettings, interactionStats, listInteractions } from "@/lib/interactive";
import InteractiveEditor from "./InteractiveEditor";

export const dynamic = "force-dynamic";

export default async function InteractivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const project = await getProject(db, id);
  if (!project) notFound();
  const [scenes, memory, settings, interactions, stats] = await Promise.all([
    listScenes(db, id), getProjectMemory(db, id), getSettings(db, id), listInteractions(db, id), interactionStats(db, id),
  ]);
  const cast = new Map<string, string>();
  for (const c of Object.values(memory).flat()) cast.set(c.characterId, c.name);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/projects/${id}`} className="text-sm text-primary">→ {project.title}</Link>
        <Link href={`/play/${id}`} className="btn btn-sm btn-primary">▶ جرّبي في المشغّل</Link>
      </div>
      <h1 className="text-2xl font-bold">إعداد الفيديو التفاعلي</h1>
      <InteractiveEditor
        projectId={id}
        scenes={scenes.map((s) => ({ id: s.id, position: s.position, title: s.title, duration: Number(s.duration_sec) }))}
        characters={[...cast].map(([cid, name]) => ({ id: cid, name }))}
        settings={settings}
        interactions={interactions}
        stats={Object.fromEntries(stats.map((x) => [x.interaction_id, { answers: x.answers, correct: x.correct }]))}
      />
    </div>
  );
}
