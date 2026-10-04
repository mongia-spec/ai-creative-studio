"use client";

import { useState, useTransition } from "react";
import { testVoiceAction } from "@/app/ask-actions";

export default function VoiceTest({ characterId }: { characterId: string }) {
  const [text, setText] = useState("مَرْحَبًا، أَنَا هُنَا لِأُسَاعِدَكُم.");
  const [res, setRes] = useState<Awaited<ReturnType<typeof testVoiceAction>> | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <textarea className="field min-h-16" dir="rtl" value={text} onChange={(e) => setText(e.target.value)} aria-label="نص اختبار الصوت" />
      <button className="btn btn-sm" disabled={pending} onClick={() => start(async () => setRes(await testVoiceAction(characterId, text)))}>🔊 اختبري الصوت</button>
      {res?.ok && <audio key={res.audioAssetId} src={`/api/assets/${res.audioAssetId}`} controls autoPlay className="w-full" data-testid="voice-audio" />}
      {res?.ok && res.reused && <p className="text-xs text-muted">♻️ نفس النص والصوت: أُعيد استخدامه دون تكلفة.</p>}
      {res && !res.ok && <p className="text-danger">{res.error}</p>}
    </div>
  );
}
