import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { getProject } from "@/lib/projects";
import { listScenes } from "@/lib/scenes";
import { listInteractions } from "@/lib/interactive";
import { getPreset } from "@/config/platform-presets";
import Timeline from "./Timeline";

export const dynamic = "force-dynamic";

export default async function TimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const project = await getProject(db, id);
  if (!project) notFound();
  const [scenes, interactions] = await Promise.all([listScenes(db, id), listInteractions(db, id)]);
  const audioIds = scenes.map((s) => s.audio_asset_id).filter(Boolean) as string[];
  const audioLen = new Map((audioIds.length ? await db.query<{ id: string; duration_sec: string | null; name: string | null }>(
    `select id, duration_sec, name from assets where id = any($1::uuid[])`, [audioIds]) : []).map((a) => [a.id, a]));
  return (
    <div className="space-y-4">
      <Link href={`/projects/${id}`} className="text-sm text-primary">→ {project.title}</Link>
      <h1 className="text-2xl font-bold">الخط الزمني</h1>
      <p className="text-sm text-muted">كل مشهد مستقل: عدّلي مدته أو رتّبه أو أعيدي توليد معاينته وحده، دون إعادة إنتاج الفيلم كله.</p>
      <Timeline
        projectId={id}
        aspect={getPreset(project.platform_preset).aspectRatio.replace(":", "/")}
        musicAssetId={project.music_asset_id}
        scenes={scenes.map((s) => ({
          id: s.id, position: s.position, title: s.title, duration: Number(s.duration_sec), preview: s.preview_asset_id, audio: s.audio_asset_id,
          audioEdit: s.audio_asset_id ? {
            name: audioLen.get(s.audio_asset_id)?.name ?? "", length: audioLen.get(s.audio_asset_id)?.duration_sec == null ? null : Number(audioLen.get(s.audio_asset_id)!.duration_sec),
            offset: Number(s.audio_offset_sec), trimStart: Number(s.audio_trim_start), trimEnd: s.audio_trim_end == null ? null : Number(s.audio_trim_end),
          } : null,
          caption: s.dialogue || s.narration, motion: s.motion, status: s.status,
          marks: interactions.filter((i) => i.scene_id === s.id).map((i) => ({ at: i.at_sec, kind: i.kind })),
        }))}
      />
    </div>
  );
}
