"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import AudioRecorder from "@/app/components/AudioRecorder";
import { linkCharacterAudioAction } from "@/app/audio-actions";

/** The character's real recorded voice: used as-is in the talking photo instead of a synthetic voice. */
export default function VoiceSamplePanel({ characterId, current, library }: {
  characterId: string; current: { id: string; name: string } | null; library: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const link = (id: string | null) => start(async () => {
    const r = await linkCharacterAudioAction(characterId, id);
    setError(r.ok ? null : r.error); router.refresh();
  });
  return (
    <section className="card space-y-3 p-4" data-testid="voice-sample">
      <h2 className="font-bold">🎤 الصوت الحقيقي للشخصية (تسجيل)</h2>
      <p className="text-sm text-muted">تسجيل بصوت حقيقي يُستخدم كما هو في الصورة المتحدثة، دون أي توليد صوتي. يحتاج إذن صاحب الصوت.</p>
      {current ? (
        <div className="space-y-2">
          <p className="text-sm">المعتمد: <b>{current.name}</b></p>
          <audio src={`/api/assets/${current.id}`} controls preload="metadata" className="w-full" />
          <button className="btn btn-sm" disabled={pending} onClick={() => link(null)}>إلغاء الربط</button>
        </div>
      ) : <p className="text-sm">لا يوجد تسجيل معتمد بعد.</p>}
      {library.length > 0 && (
        <select className="field" value="" disabled={pending} aria-label="اختاري من مكتبة الصوت" onChange={(e) => e.target.value && link(e.target.value)}>
          <option value="">📚 اختاري من مكتبة الصوت…</option>
          {library.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      )}
      <details className="rounded-lg border border-line p-2">
        <summary className="cursor-pointer text-sm">🎙️ سجّلي أو ارفعي تسجيلًا جديدًا لهذه الشخصية</summary>
        <div className="pt-2"><AudioRecorder compact characterId={characterId} onSaved={() => router.refresh()} /></div>
      </details>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </section>
  );
}
