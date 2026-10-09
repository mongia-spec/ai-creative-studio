"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AudioItem } from "@/lib/audio";
import { deleteAudioAction, linkCharacterAudioAction, linkSceneAudioAction, renameAudioAction } from "@/app/audio-actions";

const fmt = (s: number | string | null) => (s == null ? "—" : `${Math.floor(Number(s) / 60)}:${String(Math.round(Number(s) % 60)).padStart(2, "0")}`);

/** The saved recordings: listen, rename, link to a scene or a character, and delete for good. */
export default function AudioLibrary({ items, scenes, characters }: {
  items: AudioItem[];
  scenes?: { id: string; position: number; title: string }[];
  characters: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => {
    const r = await fn();
    setError(r.ok ? null : r.error ?? "حدث خطأ");
    router.refresh();
  });

  if (!items.length) return <p className="text-sm text-muted">لا توجد تسجيلات بعد. سجّلي أو ارفعي ملفًا ليظهر هنا ويُعاد استخدامه.</p>;
  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <ul className="space-y-3" data-testid="audio-library">
        {items.map((a) => (
          <li key={a.id} className="card space-y-2 p-3" data-testid="audio-item">
            <div className="flex flex-wrap items-center gap-2">
              <input key={a.name} defaultValue={a.name ?? ""} className="field min-w-0 flex-1 py-1 font-semibold" aria-label="اسم التسجيل"
                onBlur={(e) => e.target.value.trim() && e.target.value !== a.name && run(() => renameAudioAction(a.id, e.target.value))} />
              <span className="text-sm text-muted tabular-nums">{fmt(a.duration_sec)}</span>
            </div>
            <audio src={`/api/assets/${a.id}`} controls preload="metadata" className="w-full" />
            <p className="text-xs text-muted">
              {a.rights ? <>🎤 صاحب الصوت: {a.rights.speaker} · {a.rights.origin === "recording" ? "تسجيل مباشر" : "ملف مرفوع"} · أُكّد الإذن {new Date(a.rights.confirmedAt).toLocaleDateString("ar")}</>
                : <>⚠️ ملف قديم دون تأكيد للحقوق</>}
            </p>
            {(a.scenes.length > 0 || a.characters.length > 0 || a.music_of.length > 0) && (
              <p className="text-xs">
                مستخدم في: {[
                  ...a.scenes.map((s) => `المشهد ${s.position}`),
                  ...a.characters.map((c) => `صوت ${c.name}`),
                  ...a.music_of.map(() => "موسيقى مشروع"),
                ].join("، ")}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {scenes && scenes.length > 0 && (
                <select className="field w-auto py-1 text-sm" aria-label="اربطيه بمشهد" value="" disabled={pending}
                  onChange={(e) => e.target.value && run(() => linkSceneAudioAction(e.target.value, a.id))}>
                  <option value="">🎬 اربطيه بمشهد…</option>
                  {scenes.map((s) => <option key={s.id} value={s.id}>المشهد {s.position}: {s.title}</option>)}
                </select>
              )}
              {characters.length > 0 && (
                <select className="field w-auto py-1 text-sm" aria-label="اجعليه صوت شخصية" value="" disabled={pending}
                  onChange={(e) => e.target.value && run(() => linkCharacterAudioAction(e.target.value, a.id))}>
                  <option value="">👤 اجعليه صوت شخصية…</option>
                  {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <button className="btn btn-sm text-danger" disabled={pending}
                onClick={() => confirm("حذف التسجيل نهائيًا وإزالته من كل المشاهد والشخصيات؟ المقاطع التي أُنتجت منه سابقًا تبقى ملفات مستقلة.")
                  && run(() => deleteAudioAction(a.id))}>🗑 حذف نهائي</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
