"use client";

import { useState } from "react";
import { DIALECTS, VOICE_LANGUAGES } from "@/config/character-fields";
import type { KnowledgeEntry, Outfit, VoiceProfile } from "@/lib/characters";
import {
  addKnowledgeAction, createOutfitAction, deleteKnowledgeAction, deleteOutfitAction,
  setVoiceLockedAction, updateKnowledgeAction, updateVoiceAction,
} from "../actions";
import { useAction } from "../../projects/[id]/useAction";

export interface VoiceProviderOption { id: string; name: string; isMock: boolean; dialects: string[]; note?: string }

/** Voice Identity Lock: the saved voice is reused for every line, answer and talking clip. */
export function VoicePanel({ characterId, voice, providers }: { characterId: string; voice: VoiceProfile; providers: VoiceProviderOption[] }) {
  const { pending, error, run } = useAction();
  const [v, setV] = useState(voice);
  const set = <K extends keyof VoiceProfile>(k: K, val: VoiceProfile[K]) => setV({ ...v, [k]: val });
  const provider = providers.find((p) => p.id === v.provider);
  const dialectSupported = !v.dialect || provider?.dialects.includes(v.dialect);
  const locked = voice.locked;
  return (
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">هوية الصوت</h2>
        <button className={`btn btn-sm ${locked ? "btn-primary" : ""}`} disabled={pending} onClick={() => run(() => setVoiceLockedAction(characterId, !locked))}>
          {locked ? "🔒 الصوت مقفل: اضغطي لإلغاء القفل" : "🔓 اقفل الصوت"}
        </button>
      </div>
      <p className="text-sm text-muted">
        يُستخدم هذا الصوت نفسه في كل المشاهد والإجابات والصورة المتحدثة، ولا يتغيّر إلا إذا غيّرتِه أنتِ.
      </p>
      <fieldset disabled={locked || pending} className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="v-provider">مزوّد الصوت</label>
          <select id="v-provider" className="field" value={v.provider} onChange={(e) => set("provider", e.target.value)}>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}{p.isMock ? " (تجريبي)" : ""}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="v-id">معرّف الصوت (Voice ID)</label>
          <input id="v-id" className="field" dir="ltr" value={v.voice_id} placeholder="يُملأ عند ربط مزوّد صوت"
            onChange={(e) => set("voice_id", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="v-lang">اللغة</label>
          <select id="v-lang" className="field" value={v.language} onChange={(e) => set("language", e.target.value)}>
            {VOICE_LANGUAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="v-dialect">اللهجة</label>
          <select id="v-dialect" className="field" value={v.dialect} onChange={(e) => set("dialect", e.target.value)}>
            <option value="">غير محددة</option>
            {DIALECTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="v-tone">النبرة</label>
          <input id="v-tone" className="field" value={v.tone} placeholder="دافئة، هادئة، مرحة…" onChange={(e) => set("tone", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="v-style">أسلوب الأداء</label>
          <input id="v-style" className="field" value={v.style} placeholder="سرد قصصي، حوار مع أطفال…" onChange={(e) => set("style", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="v-speed">السرعة: {v.speed}</label>
          <input id="v-speed" type="range" min={0.5} max={2} step={0.05} className="w-full" value={v.speed} onChange={(e) => set("speed", Number(e.target.value))} />
        </div>
        <div>
          <label className="label" htmlFor="v-pitch">طبقة الصوت: {v.pitch}</label>
          <input id="v-pitch" type="range" min={-12} max={12} step={1} className="w-full" value={v.pitch} onChange={(e) => set("pitch", Number(e.target.value))} />
        </div>
        {!locked && (
          <div className="sm:col-span-2">
            <button type="button" className="btn btn-primary" onClick={() => run(() => updateVoiceAction(characterId, v))}>احفظ الصوت</button>
          </div>
        )}
      </fieldset>
      {provider?.note && <p className="rounded-lg bg-surface-2 p-3 text-sm">{provider.note}</p>}
      {!dialectSupported && (
        <p className="rounded-lg bg-secondary/10 p-3 text-sm">
          المزوّد المختار لا يعلن دعمه لهذه اللهجة، فلن يُدّعى نطقها. يلزم مزوّد صوت يدعمها فعلًا.
        </p>
      )}
      <p className="text-xs text-muted">لا يُستنسخ صوت شخص حقيقي دون إذن موثّق منه.</p>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </section>
  );
}

/** Saved outfits: pin one to a range of scenes from the storyboard, or change it on purpose. */
export function OutfitsPanel({ characterId, outfits }: { characterId: string; outfits: Outfit[] }) {
  const { pending, error, run } = useAction();
  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-bold">الأزياء المحفوظة</h2>
      <p className="text-sm text-muted">احفظي كل زي مرة واحدة، ثم ثبّتيه على مجموعة مشاهد من لوحة القصة. يبقى كما هو حتى تغيّريه.</p>
      {outfits.length === 0 ? <p className="text-sm text-muted">لا أزياء بعد.</p> : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {outfits.map((o) => (
            <li key={o.id} className="flex items-center gap-3 rounded-lg border border-line p-2">
              {o.asset_id
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={`/api/assets/${o.asset_id}`} alt="" className="h-14 w-14 rounded object-cover" />
                : <span className="flex h-14 w-14 items-center justify-center rounded bg-surface-2 text-xl">👗</span>}
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{o.name}</p>
                {o.description && <p className="truncate text-sm text-muted">{o.description}</p>}
              </div>
              <button className="btn btn-sm" disabled={pending}
                onClick={() => { if (confirm(`حذف الزي «${o.name}»؟`)) run(() => deleteOutfitAction(characterId, o.id)); }}>حذف</button>
            </li>
          ))}
        </ul>
      )}
      <form className="grid gap-2 sm:grid-cols-[1fr_2fr_auto_auto]" action={(fd) => run(() => createOutfitAction(characterId, fd))}>
        <input name="name" className="field" placeholder="اسم الزي (مثل: زي المدرسة)" aria-label="اسم الزي" required />
        <input name="description" className="field" placeholder="وصفه: مريول أزرق وحجاب أبيض" aria-label="وصف الزي" />
        <input name="image" type="file" accept="image/*" className="text-sm" aria-label="صورة الزي (اختيارية)" />
        <button className="btn btn-sm" disabled={pending}>أضيفي الزي</button>
      </form>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </section>
  );
}

function KnowledgeItem({ characterId, entry }: { characterId: string; entry: KnowledgeEntry }) {
  const { pending, error, run } = useAction();
  const [title, setTitle] = useState(entry.title);
  const [content, setContent] = useState(entry.content);
  const dirty = title !== entry.title || content !== entry.content;
  return (
    <li className="space-y-2 rounded-lg border border-line p-3">
      <input className="field font-semibold" value={title} aria-label="عنوان المعرفة" onChange={(e) => setTitle(e.target.value)} />
      <textarea className="field min-h-24" value={content} aria-label="محتوى المعرفة" onChange={(e) => setContent(e.target.value)} />
      <div className="flex gap-2">
        {dirty && <button className="btn btn-sm btn-primary" disabled={pending} onClick={() => run(() => updateKnowledgeAction(characterId, entry.id, { title, content }))}>احفظ</button>}
        <button className="btn btn-sm" disabled={pending}
          onClick={() => { if (confirm("حذف هذه المعرفة؟")) run(() => deleteKnowledgeAction(characterId, entry.id)); }}>حذف</button>
      </div>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </li>
  );
}

/** What the character knows. Answers come only from here; anything else is gently redirected. */
export function KnowledgePanel({ characterId, entries }: { characterId: string; entries: KnowledgeEntry[] }) {
  const { pending, error, run } = useAction();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-bold">قاعدة معرفة الشخصية</h2>
      <p className="text-sm text-muted">
        الشخصية تجيب فقط مما تكتبينه هنا (نص الدرس، معلومات عنها، أسئلة متوقعة). إن سُئلت عن شيء خارجه لا تخترع، بل تعيد الحديث بلطف إلى موضوعها.
      </p>
      <ul className="space-y-2">{entries.map((e) => <KnowledgeItem key={e.id} characterId={characterId} entry={e} />)}</ul>
      <div className="space-y-2 rounded-lg bg-surface-2 p-3">
        <input className="field" placeholder="العنوان (مثل: درس خبز ولبن)" aria-label="عنوان معرفة جديدة" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="field min-h-28" placeholder="المحتوى: النص أو الحقائق التي تعرفها الشخصية" aria-label="محتوى معرفة جديدة"
          value={content} onChange={(e) => setContent(e.target.value)} />
        <button className="btn btn-sm btn-primary" disabled={pending || !title.trim() || !content.trim()}
          onClick={() => run(async () => { const r = await addKnowledgeAction(characterId, { title, content }); if (r.ok) { setTitle(""); setContent(""); } return r; })}>
          أضيفي المعرفة
        </button>
      </div>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </section>
  );
}
