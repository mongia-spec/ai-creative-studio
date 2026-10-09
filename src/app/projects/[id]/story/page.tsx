import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { getProject } from "@/lib/projects";
import { listScenes, listShots } from "@/lib/scenes";
import { listExports } from "@/lib/studio";
import StoryShots from "./StoryShots";

export const dynamic = "force-dynamic";

export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const project = await getProject(db, id);
  if (!project) notFound();
  const scenes = await listScenes(db, id);
  const [shots, media, exports] = await Promise.all([
    listShots(db, scenes.map((s) => s.id)),
    db.query<{ id: string; kind: string; name: string | null }>(
      `select id, kind, name from assets where workspace_id=$1 and source='upload' and kind in ('image','video') and (project_id is null or project_id=$2) order by kind desc, created_at desc limit 300`,
      [project.workspace_id, id]),
    listExports(db, id),
  ]);
  return (
    <div className="space-y-4">
      <Link href={`/projects/${id}`} className="text-sm text-primary">→ {project.title}</Link>
      <h1 className="text-2xl font-bold">المشاهد والحركات المتزامنة مع الراوي</h1>
      <div className="rounded-lg bg-warn/20 p-3 text-sm">
        <p><b>بصدق:</b> الفيديو المصدَّر هنا <b>تركيب من أصولك الموجودة</b> (مقاطع جاهزة، صور، حركة كاميرا، ترجمة، صوتك). لا يولّد حركة جديدة للشخصيات.</p>
        <p>اللقطات المعلَّمة «تحتاج مزوّد فيديو» جاهز لها وصف الحركة والبرومبت، ويُولَّد الفيديو الحقيقي لها فقط بعد ربط مزوّد بموافقتك.</p>
      </div>
      <StoryShots
        projectId={id}
        scenes={scenes.map((s) => ({
          id: s.id, position: s.position, title: s.title, narration: s.narration, duration: Number(s.duration_sec),
          start: Number(s.audio_trim_start), preview: s.preview_asset_id, video: s.video_asset_id, source: s.visual_source,
          motionPrompt: s.motion_prompt, status: s.status,
          actions: shots.filter((x) => x.scene_id === s.id).map((x) => x.description),
        }))}
        media={media.map((m) => ({ id: m.id, kind: m.kind as "image" | "video", name: m.name ?? "بلا اسم" }))}
        exports={exports.map((e) => ({ id: e.id, name: e.name ?? "" }))}
      />
    </div>
  );
}
