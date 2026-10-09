import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { getProject } from "@/lib/projects";
import { listScenes } from "@/lib/scenes";
import { listExports } from "@/lib/studio";
import { PLATFORM_PRESETS } from "@/config/platform-presets";
import SocialStudio from "./SocialStudio";

export const dynamic = "force-dynamic";

export default async function SocialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const project = await getProject(db, id);
  if (!project) notFound();
  const scenes = await listScenes(db, id);
  const first = scenes.find((s) => s.preview_asset_id);
  const [brand] = await db.query(`select 1 from brand_kits where workspace_id=$1`, [project.workspace_id]);
  return (
    <div className="space-y-4">
      <Link href={`/projects/${id}`} className="text-sm text-primary">→ {project.title}</Link>
      <h1 className="text-2xl font-bold">استوديو السوشيال</h1>
      <SocialStudio
        projectId={id}
        previewAssetId={first?.preview_asset_id ?? null}
        caption={first ? first.dialogue || first.narration : ""}
        presets={PLATFORM_PRESETS.map((p) => ({ id: p.id, label: p.label, aspectRatio: p.aspectRatio, safeArea: p.safeArea, captionPos: p.captions.position }))}
        projectPreset={project.platform_preset}
        hasBrand={!!brand}
        missingPreviews={scenes.filter((s) => s.status !== "rejected" && !s.preview_asset_id).length}
        exports={(await listExports(db, id)).map((e) => ({ id: e.id, name: e.name }))}
      />
    </div>
  );
}
