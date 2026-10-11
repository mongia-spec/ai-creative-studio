"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewLesson({ characters }: { characters: { id: string; name: string }[] }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [characterId, setCharacterId] = useState(characters[0]?.id ?? "");
  const [story, setStory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!file) return;
    setBusy(true); setError(null);
    const fd = new FormData();
    fd.set("file", file); fd.set("title", title || file.name.replace(/\.[^.]+$/, "")); fd.set("characterId", characterId); fd.set("story", story);
    try {
      const r = await (await fetch("/api/video-lessons", { method: "POST", body: fd })).json();
      if (r.ok) router.push(`/projects/${r.projectId}/interactive`); else setError(r.error);
    } catch { setError("تعذّر رفع الفيديو. تحققي من الاتصال وحاولي مرة أخرى."); }
    setBusy(false);
  }

  return (
    <section className="card space-y-3 p-4">
      <label className="block space-y-1">
        <span className="label">1. الفيديو (MP4، حتى 50 ميغابايت)</span>
        <input type="file" accept="video/mp4,video/webm,video/quicktime" className="field" aria-label="ملف الفيديو"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      {file && <video src={URL.createObjectURL(file)} controls preload="metadata" className="w-full rounded-lg" />}
      <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان الدرس" aria-label="عنوان الدرس" />
      <label className="block space-y-1">
        <span className="label">2. الشخصية التي تحاور الطلاب</span>
        <select className="field" value={characterId} onChange={(e) => setCharacterId(e.target.value)} aria-label="الشخصية">
          <option value="">بلا شخصية (أسئلة فقط)</option>
          {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {characters.length === 0 && <span className="text-xs text-muted">أنشئي الشخصية أولًا من صفحة الشخصيات لتظهر هنا.</span>}
      </label>
      <label className="block space-y-1">
        <span className="label">3. نص القصة (تجيب الشخصية منه فقط)</span>
        <textarea dir="rtl" className="field min-h-36 text-lg leading-loose" value={story} onChange={(e) => setStory(e.target.value)} aria-label="نص القصة"
          placeholder="الصقي نص القصة كاملًا. إن سأل الطالب عن شيء ليس في النص، تعيده الشخصية بلطف إلى القصة." />
      </label>
      <button className="btn btn-primary" disabled={!file || busy} onClick={submit}>{busy ? "جارٍ الرفع…" : "🎬 أنشئي الدرس التفاعلي"}</button>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </section>
  );
}
