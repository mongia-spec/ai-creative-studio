import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { getProject } from "@/lib/projects";
import { listScenes } from "@/lib/scenes";
import { listAudio } from "@/lib/audio";
import { listCharacters } from "@/lib/characters";
import AudioRecorder from "@/app/components/AudioRecorder";
import AudioLibrary from "@/app/components/AudioLibrary";

export const dynamic = "force-dynamic";

export default async function ProjectAudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const project = await getProject(db, id);
  if (!project) notFound();
  const [items, scenes, characters] = await Promise.all([
    listAudio(db, project.workspace_id, id), listScenes(db, id), listCharacters(db, project.workspace_id),
  ]);
  return (
    <div className="space-y-4">
      <Link href={`/projects/${id}`} className="text-sm text-primary">→ {project.title}</Link>
      <h1 className="text-2xl font-bold">أصوات المشروع</h1>
      <p className="text-muted">سجّلي أو ارفعي، ثم اربطي التسجيل بمشهد. تعديل موضعه وقصّه من <Link className="text-primary" href={`/projects/${id}/timeline`}>الخط الزمني</Link>.</p>
      <AudioRecorder projectId={id} />
      <AudioLibrary items={items}
        scenes={scenes.map((s) => ({ id: s.id, position: s.position, title: s.title }))}
        characters={characters.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
