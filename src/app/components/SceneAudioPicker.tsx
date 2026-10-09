"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import AudioRecorder from "./AudioRecorder";
import { linkSceneAudioAction, listAudioAction } from "@/app/audio-actions";

/** Give a scene its voice: record or upload now, or reuse a saved recording without uploading again. */
export default function SceneAudioPicker({ projectId, sceneId }: { projectId: string; sceneId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<{ id: string; name: string | null }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const load = () => items === null && start(async () => setItems((await listAudioAction(projectId)).map((a) => ({ id: a.id, name: a.name }))));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select className="field w-auto py-1 text-sm" aria-label="من مكتبة الصوت" value="" onFocus={load} onPointerDown={load} disabled={pending}
          onChange={(e) => e.target.value && start(async () => {
            const r = await linkSceneAudioAction(sceneId, e.target.value);
            setError(r.ok ? null : r.error); router.refresh();
          })}>
          <option value="">📚 من مكتبة الصوت…</option>
          {items?.map((a) => <option key={a.id} value={a.id}>{a.name || "تسجيل"}</option>)}
          {items?.length === 0 && <option disabled>المكتبة فارغة</option>}
        </select>
        <button type="button" className="btn btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>🎙️ سجّلي أو ارفعي</button>
      </div>
      {open && <AudioRecorder compact projectId={projectId} sceneId={sceneId} onSaved={() => { setOpen(false); router.refresh(); }} />}
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}
