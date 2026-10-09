"use client";

import { useRef, useState, useTransition } from "react";
import { DIALECTS } from "@/config/character-fields";
import { useRouter } from "next/navigation";
import AudioRecorder from "@/app/components/AudioRecorder";
import { previewVoiceAction, talkingPhotoAction, type TalkResult } from "./actions";

type CharOpt = { id: string; name: string; cover: string | null; voiceSample: string | null };

export default function TalkingPhotoForm({ characters, initialCharacter, audio }: { characters: CharOpt[]; initialCharacter: string; audio: { id: string; name: string }[] }) {
  const router = useRouter();
  const [characterId, setCharacterIdRaw] = useState(initialCharacter);
  const selected = characters.find((c) => c.id === characterId);
  const [mode, setMode] = useState<"text" | "audio">(selected?.voiceSample ? "audio" : "text");
  const [audioId, setAudioId] = useState(selected?.voiceSample ?? "");
  const [result, setResult] = useState<TalkResult | null>(null);
  const [pending, start] = useTransition();
  function setCharacterId(id: string) {
    setCharacterIdRaw(id);
    const s = characters.find((c) => c.id === id)?.voiceSample;
    if (s) { setAudioId(s); setMode("audio"); }
  }
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<{ ok: true; audioAssetId: string } | { ok: false; error: string } | null>(null);
  function previewVoice() {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    fd.set("characterId", characterId);
    start(async () => setPreview(await previewVoiceAction(fd)));
  }

  function submit(fd: FormData) {
    fd.set("mode", mode);
    fd.set("characterId", characterId);
    fd.set("audioAssetId", mode === "audio" ? audioId : "");
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
              <select className="field" value={audioId} onChange={(e) => setAudioId(e.target.value)} aria-label="التسجيل المستخدم">
                <option value="">اختاري تسجيلًا من مكتبة الصوت…</option>
                {audio.map((a) => <option key={a.id} value={a.id}>{a.name}{selected?.voiceSample === a.id ? " (صوت الشخصية)" : ""}</option>)}
              </select>
              {audioId && <audio key={audioId} src={`/api/assets/${audioId}`} controls preload="metadata" className="w-full" />}
              <details className="rounded-lg border border-line p-2">
                <summary className="cursor-pointer text-sm">🎙️ سجّلي أو ارفعي تسجيلًا جديدًا</summary>
                <div className="pt-2"><AudioRecorder compact onSaved={(a) => { setAudioId(a.id); router.refresh(); }} /></div>
              </details>
              <p className="text-xs text-muted">التسجيل يُستخدم كما هو بدل الصوت الاصطناعي، ويُمرَّر نفسه إلى مزوّد تحريك الشفاه. لا يُستنسخ صوت أحد.</p>
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
