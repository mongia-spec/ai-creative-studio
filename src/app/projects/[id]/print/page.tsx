import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { getProject, getScript } from "@/lib/projects";
import { listScenes } from "@/lib/scenes";
import { getProjectMemory } from "@/lib/scene-memory";
import { getPreset } from "@/config/platform-presets";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

/** Printable storyboard: the browser's print dialog saves it as PDF (no server PDF engine needed). */
export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const project = await getProject(db, id);
  if (!project) notFound();
  const [script, scenes, memory] = await Promise.all([getScript(db, id), listScenes(db, id), getProjectMemory(db, id)]);
  const preset = getPreset(project.platform_preset);
  const total = scenes.reduce((a, s) => a + Number(s.duration_sec), 0);
  return (
    <div className="print-sheet space-y-4">
      <style>{`@media print { body > header, .no-print { display: none !important } body { background: #fff } .print-sheet { font-size: 11pt } .scene { break-inside: avoid } @page { size: A4; margin: 12mm } }`}</style>
      <div className="no-print flex items-center justify-between gap-2">
        <p className="text-sm text-muted">من نافذة الطباعة اختاري «حفظ بتنسيق PDF».</p>
        <PrintButton />
      </div>
      <header className="border-b border-line pb-3">
        <h1 className="text-2xl font-bold">{script?.title || project.title}</h1>
        {script?.logline && <p className="text-muted">{script.logline}</p>}
        <p className="text-sm">{preset.label} · {preset.aspectRatio} · {scenes.length} مشاهد · {Math.round(total)} ثانية</p>
      </header>
      <ol className="grid gap-4 sm:grid-cols-2 print:grid-cols-2">
        {scenes.map((s) => (
          <li key={s.id} className="scene space-y-1 rounded-lg border border-line p-3">
            <div className="overflow-hidden rounded bg-surface-2" style={{ aspectRatio: preset.aspectRatio.replace(":", "/"), maxHeight: 260 }}>
              {s.preview_asset_id
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={`/api/assets/${s.preview_asset_id}`} alt="" className="mx-auto h-full object-contain" />
                : null}
            </div>
            <h2 className="font-bold">{s.position}. {s.title} <span className="text-xs font-normal text-muted">({Number(s.duration_sec)} ث)</span></h2>
            {s.description && <p className="text-sm">{s.description}</p>}
            {s.narration && <p className="text-sm"><b>الراوي:</b> {s.narration}</p>}
            {s.dialogue && <p className="text-sm"><b>الحوار:</b> {s.dialogue}</p>}
            {(memory[s.id] ?? []).length > 0 && (
              <p className="text-xs text-muted">الشخصيات: {(memory[s.id] ?? []).map((c) => c.name + (c.effectiveOutfit ? ` (${c.effectiveOutfit.name})` : "")).join("، ")}</p>
            )}
            {(s.camera || s.location) && <p className="text-xs text-muted">{[s.location, s.camera].filter(Boolean).join(" · ")}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}
