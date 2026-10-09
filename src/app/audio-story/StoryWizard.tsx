"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import AudioRecorder from "@/app/components/AudioRecorder";
import type { StoryAnalysis } from "@/lib/audio-story";
import { analyzeStoryAction, createStoryProjectAction } from "./actions";

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const SOURCE: Record<StoryAnalysis["scenes"][number]["shots"][number]["asset"]["kind"], string> = {
  clip: "🎬 مقطع فيديو جاهز من أصولك",
  image: "🖼️ صورة مرفوعة + حركة كاميرا",
  character: "👤 صورة الشخصية المرجعية + حركة كاميرا",
  placeholder: "⬜ صورة مؤقتة: تحتاج أصلًا أو مزوّد فيديو",
};
// In-browser speech-to-text (Whisper, MIT weights; transformers.js, Apache-2.0). Runs on the user's device.
const TRANSFORMERS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0";
const MODELS = [["onnx-community/whisper-base", "سريع (نحو 80 ميغابايت)"], ["onnx-community/whisper-small", "أدق (نحو 250 ميغابايت)"]] as const;

type Opt = { id: string; label: string };
export default function StoryWizard({ audio, presets, styles, kinds }: { audio: { id: string; name: string; duration: number | null }[]; presets: Opt[]; styles: Opt[]; kinds: Opt[] }) {
  const router = useRouter();
  const [audioId, setAudioId] = useState(audio[0]?.id ?? "");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [preset, setPreset] = useState("youtube-video");
  const [names, setNames] = useState("");
  const [kind, setKind] = useState(kinds[0]?.id ?? "story");
  const [style, setStyle] = useState(styles[0]?.id ?? "cinematic");
  const [quality, setQuality] = useState<"draft" | "standard">("draft");
  const characterNames = names.split(/[،,\n]/).map((n) => n.trim()).filter(Boolean);
  const [analysis, setAnalysis] = useState<StoryAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asr, setAsr] = useState<string | null>(null);
  const [model, setModel] = useState<string>(MODELS[0][0]);
  const [pending, start] = useTransition();

  async function transcribe() {
    if (!audioId) return;
    setError(null);
    try {
      setAsr("جارٍ تحميل نموذج التفريغ في المتصفح (مرة واحدة ثم يُحفظ)…");
      const { pipeline } = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ TRANSFORMERS);
      const run = await pipeline("automatic-speech-recognition", model, {
        progress_callback: (p: { status?: string; progress?: number }) => p.status === "progress" && p.progress != null && setAsr(`تحميل النموذج: ${Math.round(p.progress)}%`),
      });
      setAsr("جارٍ تحويل الكلام إلى نص على جهازك…");
      const buf = await (await fetch(`/api/assets/${audioId}`)).arrayBuffer();
      const ctx = new AudioContext({ sampleRate: 16000 });
      const pcm = (await ctx.decodeAudioData(buf)).getChannelData(0);
      await ctx.close();
      const out = await run(pcm, { language: "arabic", task: "transcribe", chunk_length_s: 30, stride_length_s: 5 });
      setText(String((Array.isArray(out) ? out[0] : out).text ?? "").trim());
      setAsr("✓ انتهى التفريغ. راجعيه وصحّحيه قبل التحليل: التفريغ الآلي قد يخطئ في بعض الكلمات.");
    } catch (e) {
      setAsr(null);
      setError(`تعذّر التفريغ التلقائي على هذا الجهاز (${e instanceof Error ? e.message.slice(0, 120) : "خطأ"}). الصقي نص الفقرة يدويًا.`);
    }
  }

  const analyze = () => start(async () => {
    setError(null);
    const r = await analyzeStoryAction(audioId, text, characterNames);
    if (r.ok) setAnalysis(r.analysis); else { setAnalysis(null); setError(r.error); }
  });
  const create = () => start(async () => {
    const r = await createStoryProjectAction({ audioAssetId: audioId, transcript: text, title, platformPreset: preset, characters: characterNames, kind, style, quality });
    if (r.ok) router.push(`/projects/${r.projectId}/story`); else setError(r.error);
  });
  const shots = analysis?.scenes.flatMap((s) => s.shots) ?? [];

  return (
    <div className="space-y-4">
      <section className="card space-y-3 p-4">
        <h2 className="font-bold">1. تسجيل الراوي</h2>
        <select className="field" value={audioId} onChange={(e) => { setAudioId(e.target.value); setAnalysis(null); }} aria-label="تسجيل الراوي">
          <option value="">اختاري تسجيلًا من مكتبة الصوت…</option>
          {audio.map((a) => <option key={a.id} value={a.id}>{a.name}{a.duration ? ` (${fmt(a.duration)})` : ""}</option>)}
        </select>
        {audioId && <audio key={audioId} src={`/api/assets/${audioId}`} controls preload="metadata" className="w-full" />}
        <details className="rounded-lg border border-line p-2">
          <summary className="cursor-pointer text-sm">🎙️ سجّلي أو ارفعي تسجيلًا جديدًا (MP3 · WAV · M4A)</summary>
          <div className="pt-2"><AudioRecorder compact onSaved={(a) => { setAudioId(a.id); setAnalysis(null); router.refresh(); }} /></div>
        </details>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-bold">2. النص المقروء</h2>
        <p className="text-sm text-muted">الصقي نص الفقرة كما قرأتِها، أو جرّبي التفريغ التلقائي المجاني في المتصفح ثم صحّحيه.</p>
        <div className="flex flex-wrap items-center gap-2">
          <select className="field w-auto py-1 text-sm" value={model} onChange={(e) => setModel(e.target.value)} aria-label="نموذج التفريغ">
            {MODELS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
          </select>
          <button type="button" className="btn btn-sm" disabled={!audioId || (!!asr && !asr.startsWith("✓"))} onClick={transcribe}>📝 تفريغ تلقائي (تجريبي)</button>
        </div>
        {asr && <p className="text-sm" role="status">{asr}</p>}
        <textarea dir="rtl" className="field min-h-36 text-lg leading-loose" value={text} onChange={(e) => { setText(e.target.value); setAnalysis(null); }}
          aria-label="النص المقروء" placeholder="الصقي نص الفقرة هنا…" />
        <label className="block space-y-1">
          <span className="label">أسماء الشخصيات في النص (اختياري، مفصولة بفواصل)</span>
          <input className="field" value={names} onChange={(e) => { setNames(e.target.value); setAnalysis(null); }} aria-label="أسماء الشخصيات" placeholder="مثال: ليلى، الجد، البائع" />
          <span className="text-xs text-muted">الشخصيات الجديدة تُنشأ تلقائيًا من وصف النص، ويمكن رفع صور مرجعية لها لاحقًا. شخصيات مكتبتك تُعرف تلقائيًا.</span>
        </label>
        <button className="btn btn-primary" disabled={pending || !audioId || text.trim().length < 3} onClick={analyze}>{pending && !analysis ? "جارٍ التحليل…" : "🔎 حلّلي وقسّمي إلى مشاهد"}</button>
      </section>

      {error && <p className="text-sm text-danger" role="alert">{error}</p>}

      {analysis && (
        <section className="card space-y-4 p-4" data-testid="story-analysis">
          <h2 className="font-bold">3. التحليل والحركات المقترحة</h2>
          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <p>⏱️ المدة: <b>{fmt(analysis.duration)}</b> · {analysis.scenes.length} مشاهد · {shots.length} لقطات</p>
            <p>👤 الشخصيات: <b>{analysis.characters.map((c) => c.name).join("، ") || "لم يُعثر على شخصية من مكتبتك في النص"}</b></p>
            <p>📍 الأماكن: <b>{analysis.places.join("، ") || "لم يُذكر مكان"}</b></p>
          </div>
          <p className="text-xs text-muted">
            التوقيت {analysis.timing === "pauses" ? "مبني على وقفات صوتك بين الجمل" : "موزّع حسب طول الجمل (لم تُكتشف وقفات واضحة)"}، وتوقيت كل حركة داخل الجملة تقديري. عدّليه بعد الإنشاء من الخط الزمني.
          </p>
          {analysis.scenes.map((sc) => (
            <div key={sc.index} className="space-y-2">
              <h3 className="font-semibold">المشهد {sc.index}{sc.place ? `: ${sc.place}` : ""}</h3>
              <ol className="space-y-2">
                {sc.shots.map((s) => (
                  <li key={s.index} className="rounded-lg border border-line p-3 text-sm" data-testid="story-shot">
                    <p className="text-xs text-muted tabular-nums">لقطة {s.index} · {fmt(s.start)} ← {fmt(s.end)}</p>
                    <p className="text-base">«{s.text}»</p>
                    {s.actions.length > 0 ? (
                      <ul className="mt-1 space-y-0.5">
                        {s.actions.map((a, k) => <li key={k}>🏃 <span className="tabular-nums text-muted">{fmt(a.at)}</span> {a.motion} <span className="text-muted">(من «{a.verb}»)</span></li>)}
                      </ul>
                    ) : <p className="mt-1 text-muted">لا فعل حركة في هذه الجملة: لقطة وصفية بحركة كاميرا هادئة.</p>}
                    {s.expression && <p>🙂 التعبير: {s.expression}</p>}
                    {s.inferredCharacter && <p className="text-xs text-muted">الشخصية مستنتجة من الفعل (الجملة السابقة).</p>}
                    <p className="mt-1">{SOURCE[s.asset.kind]}{s.asset.name ? `: ${s.asset.name}` : ""}</p>
                  </li>
                ))}
              </ol>
            </div>
          ))}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <select className="field" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="نوع المشروع">{kinds.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
            <select className="field" value={style} onChange={(e) => setStyle(e.target.value)} aria-label="الأسلوب البصري">{styles.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
            <select className="field" value={quality} onChange={(e) => setQuality(e.target.value as "draft" | "standard")} aria-label="الجودة">
              <option value="draft">مسودة 480p (الأرخص)</option><option value="standard">قياسي 720p</option>
            </select>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان المشروع (اختياري)" aria-label="عنوان المشروع" />
            <select className="field" value={preset} onChange={(e) => setPreset(e.target.value)} aria-label="المنصة">
              {presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" disabled={pending} onClick={create}>{pending ? "جارٍ الإنشاء…" : "🎬 أنشئي المشاهد واللقطات بهذا التوقيت"}</button>
        </section>
      )}
    </div>
  );
}
