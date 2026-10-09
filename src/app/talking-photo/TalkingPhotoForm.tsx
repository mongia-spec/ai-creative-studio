"use client";

import { useRef, useState, useTransition } from "react";
import { DIALECTS } from "@/config/character-fields";
import { previewVoiceAction, talkingPhotoAction, type TalkResult } from "./actions";

type CharOpt = { id: string; name: string; cover: string | null };

export default function TalkingPhotoForm({ characters, initialCharacter }: { characters: CharOpt[]; initialCharacter: string }) {
  const [characterId, setCharacterId] = useState(initialCharacter);
  const [mode, setMode] = useState<"text" | "audio">("text");
  const [result, setResult] = useState<TalkResult | null>(null);
  const [pending, start] = useTransition();
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState<Blob | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const [recError, setRecError] = useState<string | null>(null);
  const selected = characters.find((c) => c.id === characterId);
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<{ ok: true; audioAssetId: string } | { ok: false; error: string } | null>(null);
  function previewVoice() {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    fd.set("characterId", characterId);
    start(async () => setPreview(await previewVoiceAction(fd)));
  }

  async function toggleRecord() {
    setRecError(null);
    if (recording) { recRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); setRecorded(new Blob(chunks, { type: rec.mimeType || "audio/webm" })); setRecording(false); };
      recRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setRecError("تعذّر الوصول إلى الميكروفون. اسمحي للمتصفح باستخدامه، أو ارفعي ملفًا صوتيًا.");
    }
  }

  function submit(fd: FormData) {
    fd.set("mode", mode);
    fd.set("characterId", characterId);
    if (mode === "audio" && recorded && !(fd.get("audio") instanceof File && (fd.get("audio") as File).size > 0)) {
      fd.set("audio", new File([recorded], "recording.webm", { type: recorded.type }));
    }
    start(async () => setResult(await talkingPhotoAction(fd)));
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <form ref={formRef} action={submit} className="card space-y-4 p-4">
        <div>
          <label className="label" htmlFor="tp-char">الشخصية</label>
          <select id="tp-char" className="field" value={characterId} onChange={(e) => setCharacterId(e.target.value)}>
            <option value="">دون شخصية: أرفع صورة</option>
            {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {selected && (
            <div className="mt-2 flex items-center gap-3 text-sm">
              {selected.cover
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={`/api/assets/${selected.cover}`} alt="" className="h-16 w-16 rounded-lg object-cover" />
                : <span className="text-danger">لا صورة رئيسية لهذه الشخصية. أضيفيها من صفحة الشخصية.</span>}
              <span className="text-muted">تُستخدم صورتها الرئيسية وصوتها المحفوظ كما هما.</span>
            </div>
          )}
        </div>
        {!characterId && (
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="tp-image">الصورة</label>
              <input id="tp-image" name="image" type="file" accept="image/*" className="text-sm" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="tp-dialect">اللهجة</label>
                <select id="tp-dialect" name="dialect" className="field" defaultValue="">
                  <option value="">غير محددة</option>
                  {DIALECTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="tp-speed">السرعة</label>
                <input id="tp-speed" name="speed" type="number" min={0.5} max={2} step={0.1} defaultValue={1} className="field" />
              </div>
            </div>
          </div>
        )}
        <fieldset className="space-y-2">
          <legend className="label">ماذا تقول؟</legend>
          <div className="flex gap-2">
            <button type="button" className={`btn btn-sm ${mode === "text" ? "btn-primary" : ""}`} aria-pressed={mode === "text"} onClick={() => setMode("text")}>نص</button>
            <button type="button" className={`btn btn-sm ${mode === "audio" ? "btn-primary" : ""}`} aria-pressed={mode === "audio"} onClick={() => setMode("audio")}>صوت مسجّل</button>
          </div>
          {mode === "text" ? (
            <div className="space-y-2">
              <textarea name="text" dir="rtl" className="field min-h-28 text-lg leading-loose" aria-label="النص"
                placeholder="مرحبًا يا أصدقائي، هيّا نتعلّم معًا!" />
              <button type="button" className="btn btn-sm" disabled={pending} onClick={previewVoice}>🔊 معاينة الصوت أولًا</button>
              {preview?.ok && <audio key={preview.audioAssetId} src={`/api/assets/${preview.audioAssetId}`} controls autoPlay className="w-full" data-testid="voice-preview" />}
              {preview && !preview.ok && <p className="text-sm text-danger">{preview.error}</p>}
            </div>
          ) : (
            <div className="space-y-2">
              <input name="audio" type="file" accept="audio/*" className="text-sm" aria-label="ملف صوتي" />
              <div className="flex items-center gap-2">
                <button type="button" className="btn btn-sm" onClick={toggleRecord}>{recording ? "⏹ أوقفي التسجيل" : "🎙️ سجّلي صوتك"}</button>
                {recorded && !recording && <audio controls src={URL.createObjectURL(recorded)} className="h-8" />}
              </div>
              {recError && <p className="text-sm text-danger">{recError}</p>}
              <p className="text-xs text-muted">الصوت المرفوع يُستخدم كما هو. لا يُستنسخ صوت أحد دون إذنه.</p>
            </div>
          )}
        </fieldset>
        <button className="btn btn-primary" disabled={pending}>{pending ? "جارٍ الإنشاء…" : "أنشئي المقطع المتحدث"}</button>
        {result && !result.ok && <p className="text-sm text-danger" role="alert">{result.error}</p>}
      </form>
      <section className="card space-y-2 p-4">
        <h2 className="font-bold">النتيجة</h2>
        {result?.ok ? (
          <>
            <video key={result.videoAssetId} src={`/api/assets/${result.videoAssetId}`} controls autoPlay className="w-full rounded-lg bg-black" data-testid="talking-video" />
            {result.reused && <p className="text-sm text-muted">♻️ نفس الطلب أُنشئ سابقًا، فأُعيد استخدامه دون تكلفة.</p>}
            {result.dialectNote && <p className="text-sm">{result.dialectNote}</p>}
            <a className="btn btn-sm" href={`/api/assets/${result.videoAssetId}`} download="talking.mp4">تنزيل MP4</a>
          </>
        ) : <p className="text-sm text-muted">سيظهر المقطع هنا.</p>}
      </section>
    </div>
  );
}
