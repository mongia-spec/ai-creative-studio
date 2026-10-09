"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { exportDraftAction } from "@/app/actions";
import { setSceneVisualAction } from "@/app/audio-story/actions";

type S = { id: string; position: number; title: string; narration: string; duration: number; start: number; preview: string | null;
  video: string | null; source: string | null; motionPrompt: string; status: string; actions: string[] };
const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const BADGE: Record<string, [string, string]> = {
  clip: ["🎬 مقطع جاهز من أصولك", "bg-primary/15"],
  image: ["🖼️ صورة مرفوعة + حركة كاميرا", "bg-secondary/20"],
  character: ["👤 صورة الشخصية + حركة كاميرا", "bg-secondary/20"],
  placeholder: ["⬜ صورة مؤقتة · تحتاج أصلًا أو مزوّد فيديو", "bg-warn/30"],
  ai_image: ["✨ صورة مولّدة بالذكاء الاصطناعي", "bg-primary/15"],
  ai_video: ["✨ حركة مولّدة بالذكاء الاصطناعي", "bg-primary/25"],
};

export default function StoryShots({ projectId, scenes, media, exports }: {
  projectId: string; scenes: S[]; media: { id: string; kind: "image" | "video"; name: string }[]; exports: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => {
    const r = await fn(); setError(r.ok ? null : r.error ?? "حدث خطأ"); router.refresh();
  });
  const needProvider = scenes.filter((s) => s.source === "placeholder").length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>{scenes.length} لقطات · {needProvider ? `${needProvider} تحتاج أصلًا أو مزوّد فيديو` : "كل اللقطات لها أصول"}</span>
        <Link className="btn btn-sm" href={`/projects/${projectId}/timeline`}>🎞️ ضبط التوقيت</Link>
        <Link className="btn btn-sm" href={`/projects/${projectId}`}>✏️ لوحة القصة ورفع صور ومقاطع</Link>
        <button className="btn btn-sm btn-primary" disabled={pending} onClick={() => act(() => exportDraftAction(projectId, { captions: true }))}>
          {pending ? "جارٍ العمل…" : "📤 صدّري فيديو متزامنًا مع صوتك"}
        </button>
      </div>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      {exports[0] && (
        <section className="card space-y-2 p-3" data-testid="story-export">
          <b>آخر فيديو مصدَّر: {exports[0].name}</b>
          <video key={exports[0].id} src={`/api/assets/${exports[0].id}`} controls preload="metadata" className="max-h-96 w-full rounded-lg bg-black" />
          <a className="btn btn-sm" href={`/api/assets/${exports[0].id}`} download>تنزيل MP4</a>
        </section>
      )}
      <ol className="space-y-3">
        {scenes.map((s) => {
          const [label, cls] = BADGE[s.source ?? "placeholder"] ?? BADGE.placeholder;
          return (
            <li key={s.id} className="card grid grid-cols-1 gap-3 p-3 sm:grid-cols-[160px_minmax(0,1fr)]" data-testid="story-scene">
              <div className="aspect-video overflow-hidden rounded bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {s.preview && <img src={`/api/assets/${s.preview}`} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 space-y-1 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <b>{s.title}</b>
                  <span className="tabular-nums text-muted">{fmt(s.start)} ← {fmt(s.start + s.duration)}</span>
                  <span className={`rounded px-2 py-0.5 text-xs ${cls}`}>{label}</span>
                </p>
                <p className="text-base">«{s.narration}»</p>
                {s.actions.length ? <ul>{s.actions.map((a, k) => <li key={k}>🏃 {a}</li>)}</ul> : <p className="text-muted">بلا حركة شخصية: حركة كاميرا هادئة.</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <select className="field w-auto max-w-full py-1 text-sm" value="" disabled={pending} aria-label="اختاري صورة أو مقطعًا لهذه اللقطة"
                    onChange={(e) => e.target.value && act(() => setSceneVisualAction(s.id, e.target.value))}>
                    <option value="">🔁 استخدمي أصلًا آخر لهذه اللقطة…</option>
                    {media.map((m) => <option key={m.id} value={m.id}>{m.kind === "video" ? "🎬" : "🖼️"} {m.name}</option>)}
                  </select>
                  {s.source !== "placeholder" && <button className="btn btn-sm" disabled={pending} onClick={() => act(() => setSceneVisualAction(s.id, null))}>إزالة الأصل</button>}
                </div>
                <details>
                  <summary className="cursor-pointer text-primary">وصف الحركة والبرومبت لمزوّد فيديو{s.source === "placeholder" ? " (مطلوب لهذه اللقطة)" : ""}</summary>
                  <p className="mt-1 rounded bg-surface-2 p-2" dir="rtl">{s.motionPrompt}</p>
                  <button className="btn btn-sm mt-1" onClick={() => navigator.clipboard?.writeText(s.motionPrompt)}>نسخ</button>
                </details>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
