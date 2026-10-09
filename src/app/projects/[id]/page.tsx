import Link from "next/link";
import ExportPanel, { ProductionPanel } from "./ExportPanel";
import { listExports } from "@/lib/studio";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { getProject, getScript, listVersions } from "@/lib/projects";
import { listScenes, listShots } from "@/lib/scenes";
import { listProjectJobs } from "@/lib/jobs";
import { listProjectAssets } from "@/lib/assets";
import { estimateFromScenes, spendSummary } from "@/lib/cost";
import { getPreset, PLATFORM_PRESETS, STYLES } from "@/config/platform-presets";
import { getProjectMemory } from "@/lib/scene-memory";
import { listCharacters, listOutfits } from "@/lib/characters";
import { composeScenePrompt } from "@/lib/prompt";
import { ProjectStatus, UnavailableButton } from "../../components";
import ScriptEditor from "./ScriptEditor";
import Storyboard from "./Storyboard";
import { AssetsPanel, JobsPanel } from "./Panels";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const project = await getProject(db, id);
  if (!project || project.status === "archived") notFound();
  const [script, scenes, jobs, uploads, spend, versions] = await Promise.all([
    getScript(db, id), listScenes(db, id), listProjectJobs(db, id), listProjectAssets(db, id, "upload"),
    spendSummary(db, { projectId: id }), listVersions(db, id),
  ]);
  const [shots, memory, characters, exports] = await Promise.all([
    listShots(db, scenes.map((s) => s.id)), getProjectMemory(db, id), listCharacters(db, project.workspace_id), listExports(db, id),
  ]);
  const [brand] = await db.query(`select 1 from brand_kits where workspace_id=$1`, [project.workspace_id]);
  const preset = getPreset(project.platform_preset);
  const active = scenes.filter((s) => s.status !== "rejected");
  const estimate = estimateFromScenes(active);
  const totalSec = active.reduce((a, s) => a + s.duration_sec, 0);
  const approved = scenes.filter((s) => s.status === "approved").length;

  const steps = [
    { label: project.start_type === "idea" ? "الفكرة" : "النص الأصلي", done: true },
    { label: "النص", done: !!script },
    { label: "المشاهد", done: scenes.length > 0 },
    { label: "لوحة القصة معتمدة", done: project.status === "approved" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{project.title}</h1>
          <p className="text-sm text-muted">
            {preset.label} · {preset.aspectRatio} · الهدف {project.target_duration_sec} ثانية ·
            أسلوب {STYLES.find((s) => s.id === project.style)?.label ?? project.style}
          </p>
        </div>
        <ProjectStatus status={project.status} />
      </div>

      <ol className="flex flex-wrap gap-2" aria-label="مراحل المشروع">
        {steps.map((s, i) => (
          <li key={s.label} className={`rounded-full px-3 py-1 text-sm ${s.done ? "bg-secondary text-white" : "bg-surface-2 text-muted"}`}>
            {i + 1}. {s.label} {s.done ? "✓" : ""}
          </li>
        ))}
      </ol>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-6">
          <ScriptEditor projectId={project.id} inputText={project.input_text} startType={project.start_type} script={script} />
          <Storyboard
            projectId={project.id}
            scenes={scenes}
            shots={shots.map((s) => ({ ...s, duration_sec: Number(s.duration_sec) }))}
            aspect={preset.aspectRatio.replace(":", " / ")}
            memory={memory}
            prompts={Object.fromEntries(scenes.map((s) => [s.id, composeScenePrompt(s, memory[s.id] ?? [])]))}
            characters={await Promise.all(characters.map(async (c) => ({ id: c.id, name: c.name, locked: c.locked, outfits: (await listOutfits(db, c.id)).map((o) => ({ id: o.id, name: o.name })) })))}
          />
        </div>

        <aside className="space-y-4">
          <section className="card space-y-2 p-4">
            <h2 className="font-bold">ملخّص لوحة القصة</h2>
            <p className="text-sm">{scenes.length} مشاهد · {approved} معتمدة · المدة {totalSec} ثانية</p>
            {totalSec > project.target_duration_sec * 1.2 && <p className="text-sm text-warn">المدة أطول من الهدف بأكثر من 20٪.</p>}
          </section>

          <section className="card space-y-2 p-4">
            <h2 className="font-bold">تقدير التكلفة قبل التوليد</h2>
            <table className="w-full text-sm">
              <tbody>
                {estimate.map((e) => (
                  <tr key={e.capability} className="border-b border-line last:border-0">
                    <td className="py-1">{e.label}</td>
                    <td className="py-1 text-end tabular-nums">{e.units}</td>
                    <td className="py-1 text-end tabular-nums">${e.costUsd.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted">الكميات محسوبة من مشاهدك. السعر صفر لأن المزوّدات الحالية تجريبية؛ يظهر السعر الحقيقي عند اعتماد مزوّد.</p>
            <p className="text-sm">المصروف الفعلي لهذا المشروع: <b>${spend.totalUsd.toFixed(2)}</b> ({spend.calls} استدعاء تجريبي)</p>
          </section>

          <ProductionPanel projectId={project.id} musicAssetId={project.music_asset_id} musicVolume={Number(project.music_volume)} />
          <ExportPanel projectId={project.id} exports={exports} missingPreviews={scenes.filter((s) => s.status !== "rejected" && !s.preview_asset_id).length}
            presets={PLATFORM_PRESETS.map((p) => ({ id: p.id, label: p.label, aspectRatio: p.aspectRatio }))} projectPreset={project.platform_preset}
            sceneCount={scenes.length} hasBrand={!!brand} />

          <section className="card space-y-2 p-4">
            <h2 className="font-bold">الخطوات التالية</h2>
            <Link href={`/play/${project.id}`} className="btn btn-primary w-full justify-between">▶ المشغّل التفاعلي <span className="text-xs">اسأل الشخصيات</span></Link>
            <Link href={`/projects/${project.id}/social`} className="btn w-full justify-between">📱 استوديو السوشيال <span className="text-xs">Hooks · CTA · منصات</span></Link>
            <UnavailableButton label="توليد صور حقيقية" status="PROVIDER_REQUIRED" />
            <UnavailableButton label="تعليق صوتي عربي" status="PROVIDER_REQUIRED" />
            <UnavailableButton label="توليد الفيديو النهائي" status="PROVIDER_REQUIRED" />
          </section>

          <AssetsPanel projectId={project.id} assets={uploads} />
          <JobsPanel projectId={project.id} jobs={jobs} />

          {versions.length > 0 && (
            <section className="card p-4 text-sm">
              <h2 className="mb-1 font-bold">النسخ المحفوظة</h2>
              <ul>{versions.map((v) => <li key={v.version}>نسخة {v.version}: {v.note}</li>)}</ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
