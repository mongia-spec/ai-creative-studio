import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { getProject } from "@/lib/projects";
import { listScenes } from "@/lib/scenes";
import { getProjectMemory } from "@/lib/scene-memory";
import { getIdentityPack, listKnowledge } from "@/lib/characters";
import { getPreset } from "@/config/platform-presets";
import Player from "./Player";
import { getSettings, listInteractions } from "@/lib/interactive";

export const dynamic = "force-dynamic";

export default async function PlayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const project = await getProject(db, id);
  if (!project) notFound();
  const [scenes, memory] = await Promise.all([listScenes(db, id), getProjectMemory(db, id)]);
  const castIds = [...new Set(Object.values(memory).flat().map((c) => c.characterId))];
  const characters = await Promise.all(castIds.map(async (cid) => {
    const pack = await getIdentityPack(db, cid);
    return { id: cid, name: pack.character.name, avatarAssetId: pack.primaryAssetId, knowledge: (await listKnowledge(db, cid, id)).length };
  }));
  const preset = getPreset(project.platform_preset);
  const [settings, interactions] = await Promise.all([getSettings(db, id), listInteractions(db, id)]);
  const askable = settings.allowAsk ? characters.filter((c) => !settings.askable.length || settings.askable.includes(c.id)) : [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/projects/${id}`} className="text-sm text-primary">→ {project.title}</Link>
        <span className="flex items-center gap-2 text-xs text-muted">مشغّل تفاعلي · المعاينات تجريبية
          <Link href={`/projects/${id}/interactive`} className="btn btn-sm">⚙️ إعداد التفاعل</Link></span>
      </div>
      {scenes.length === 0 ? <p className="card p-6 text-center text-muted">لا مشاهد بعد.</p> : (
        <Player
          projectId={id}
          aspect={preset.aspectRatio.replace(":", "/")}
          scenes={scenes.map((s) => ({
            id: s.id, position: s.position, title: s.title, previewAssetId: s.preview_asset_id,
            subtitle: s.dialogue || s.narration || s.description, durationSec: Number(s.duration_sec),
            cast: (memory[s.id] ?? []).map((c) => c.characterId),
          }))}
          characters={askable}
          settings={{ allowMic: settings.allowMic, maxTier: settings.maxTier }}
          interactions={interactions.map((i) => ({ id: i.id, sceneId: i.scene_id, atSec: i.at_sec, kind: i.kind, prompt: i.prompt, choices: i.choices }))}
        />
      )}
    </div>
  );
}
