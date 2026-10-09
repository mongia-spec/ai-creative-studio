"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { saveAudioAction, type SavedAudio } from "@/app/audio-actions";

const MAX_SEC = 600;
const ACCEPT = ".mp3,.wav,.m4a,.aac,.ogg,.webm,audio/*";
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function pickMime() {
  if (typeof MediaRecorder === "undefined") return "";
  // iPhone Safari records MP4/AAC; Chrome and Firefox record WebM/Opus (converted to M4A on save).
  return ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported?.(m)) ?? "";
}

/**
 * Record from the microphone (after the browser asks the user) or pick a file, listen, redo, then save
 * to the audio library with the speaker's name and a rights confirmation. All in the browser, free.
 */
export default function AudioRecorder({ projectId, sceneId, characterId, onSaved, compact }: {
  projectId?: string; sceneId?: string; characterId?: string; onSaved?: (a: SavedAudio) => void; compact?: boolean;
}) {
  const [state, setState] = useState<"idle" | "recording" | "ready">("idle");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [origin, setOrigin] = useState<"recording" | "upload">("recording");
  const [fileName, setFileName] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [secs, setSecs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); rec.current?.stream.getTracks().forEach((t) => t.stop()); }, []);

  function take(b: Blob, o: "recording" | "upload", name: string) {
    setBlob(b); setOrigin(o); setFileName(name); setUrl(URL.createObjectURL(b)); setState("ready"); setDone(null);
  }

  async function startRec() {
    setError(null); setDone(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(window.isSecureContext ? "هذا المتصفح لا يدعم التسجيل. ارفعي ملفًا صوتيًا بدلًا منه."
        : "التسجيل يحتاج اتصالًا آمنًا (https). ارفعي ملفًا صوتيًا، أو افتحي المنصة من رابط https.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mime = pickMime();
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timer.current) clearInterval(timer.current);
        const type = (r.mimeType || mime || "audio/webm").split(";")[0];
        const b = new Blob(chunks, { type });
        if (!b.size) { setError("لم يُسجَّل أي صوت. حاولي مرة أخرى."); setState("idle"); return; }
        take(b, "recording", `تسجيل ${new Date().toLocaleString("ar")}`);
      };
      rec.current = r;
      r.start(1000);
      setSecs(0); setState("recording");
      timer.current = setInterval(() => setSecs((s) => { if (s + 1 >= MAX_SEC) r.stop(); return s + 1; }), 1000);
    } catch (e) {
      const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
      setError(denied ? "لم يُسمح باستخدام الميكروفون. اسمحي به من إعدادات المتصفح ثم أعيدي المحاولة، أو ارفعي ملفًا."
        : "لم يُعثر على ميكروفون يعمل. ارفعي ملفًا صوتيًا بدلًا منه.");
    }
  }

  function reset() {
    setBlob(null); setUrl(null); setState("idle"); setSecs(0); setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function save(fd: FormData) {
    if (!blob) return;
    const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : blob.type.includes("webm") ? "webm" : "";
    const file = blob instanceof File ? blob : new File([blob], `recording.${ext || "webm"}`, { type: blob.type });
    fd.set("file", file);
    fd.set("origin", origin);
    if (projectId) fd.set("projectId", projectId);
    if (sceneId) fd.set("sceneId", sceneId);
    if (characterId) fd.set("characterId", characterId);
    start(async () => {
      const r = await saveAudioAction(fd);
      if (!r.ok) { setError(r.error); return; }
      setDone(`حُفظ «${r.audio.name}» في مكتبة الصوت${r.audio.durationSec ? ` (${fmt(r.audio.durationSec)})` : ""}.`);
      reset();
      onSaved?.(r.audio);
    });
  }

  return (
    <div className={`space-y-3 ${compact ? "" : "card p-4"}`} data-testid="audio-recorder">
      <div className="flex flex-wrap items-center gap-2">
        {state !== "recording" ? (
          <button type="button" className="btn btn-sm btn-primary" onClick={startRec} disabled={pending}>
            🎙️ {state === "ready" && origin === "recording" ? "أعيدي التسجيل" : "سجّلي بالميكروفون"}
          </button>
        ) : (
          <button type="button" className="btn btn-sm bg-danger text-white" onClick={() => rec.current?.stop()}>
            ⏹ أوقفي التسجيل <span aria-live="polite" className="tabular-nums">{fmt(secs)}</span>
          </button>
        )}
        <span className="text-sm text-muted">أو</span>
        <label className="btn btn-sm cursor-pointer">
          📁 ارفعي ملفًا (MP3 · WAV · M4A)
          <input ref={fileRef} type="file" accept={ACCEPT} className="sr-only" aria-label="ملف صوتي" disabled={state === "recording"}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) take(f, "upload", f.name.replace(/\.[^.]+$/, "")); }} />
        </label>
      </div>
      {state === "recording" && <p className="flex items-center gap-2 text-sm"><span className="h-3 w-3 animate-pulse rounded-full bg-danger" />جارٍ التسجيل… (حتى 10 دقائق)</p>}
      {state === "ready" && url && (
        <form action={save} className="space-y-2">
          <audio src={url} controls className="w-full" data-testid="audio-preview" />
          <div className="grid gap-2 sm:grid-cols-2">
            <input name="name" className="field" defaultValue={fileName} aria-label="اسم التسجيل" placeholder="اسم التسجيل" />
            <input name="speaker" className="field" aria-label="صاحب الصوت" placeholder="صاحب الصوت (مثلًا: أنا، أو اسم المؤدي)" required />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="consent" required className="mt-1" />
            <span>أؤكد أن هذا صوتي، أو أن لديّ إذنًا صريحًا من صاحبه باستخدامه في هذا المحتوى.</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-sm btn-primary" disabled={pending}>{pending ? "جارٍ الحفظ…" : "💾 احفظي في المكتبة"}</button>
            <button type="button" className="btn btn-sm" onClick={reset} disabled={pending}>🗑 تجاهلي</button>
          </div>
        </form>
      )}
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      {done && <p className="text-sm text-secondary" role="status">✓ {done}</p>}
      {!compact && <p className="text-xs text-muted">🔒 يبقى التسجيل على خادم المنصة ولا يُرسل إلى أي خدمة خارجية. يمكنك حذفه نهائيًا في أي وقت.</p>}
    </div>
  );
}
