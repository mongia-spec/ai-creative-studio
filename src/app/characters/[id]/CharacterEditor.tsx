"use client";

import { useState } from "react";
import type { Character } from "@/lib/characters";
import { REFERENCE_ROLES, type ReferenceRole } from "@/config/character-fields";
import { deleteCharacterAction, removeReferenceAction, setLockedAction, setReferenceRoleAction, updateCharacterAction, uploadReferencesAction } from "../actions";
import { useAction } from "../../projects/[id]/useAction";

export default function CharacterEditor(props: {
  character: Character;
  fields: { key: string; label: string }[];
  references: { id: string; name: string | null; role: ReferenceRole }[];
  descriptor: string;
}) {
  const c = props.character;
  const { pending, error, run } = useAction();
  const [name, setName] = useState(c.name);
  const [description, setDescription] = useState(c.description);
  const [attrs, setAttrs] = useState<Record<string, string>>({ ...(c.attributes as Record<string, string>) });
  const locked = c.locked;

  return (
    <div className="space-y-4">
      <section className="card space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">{c.name}</h1>
          <button className={`btn ${locked ? "btn-primary" : ""}`} disabled={pending} onClick={() => run(() => setLockedAction(c.id, !locked))}>
            {locked ? "🔒 مقفلة: اضغطي لإلغاء القفل" : "🔓 اقفل الشخصية"}
          </button>
        </div>
        {locked && (
          <p className="rounded-lg bg-secondary/10 p-3 text-sm">
            الشخصية مقفلة: وصفها وصورها ثابتة، وتُستخدم كما هي في كل المشاهد. ألغِ القفل لتعديلها.
          </p>
        )}
        <fieldset disabled={locked || pending} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="ch-name">الاسم</label>
              <input id="ch-name" className="field" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="ch-desc">وصف قصير</label>
              <input id="ch-desc" className="field" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            {props.fields.map((f) => (
              <div key={f.key}>
                <label className="label" htmlFor={`a-${f.key}`}>{f.label}</label>
                <input id={`a-${f.key}`} className="field" value={attrs[f.key] ?? ""} onChange={(e) => setAttrs({ ...attrs, [f.key]: e.target.value })} />
              </div>
            ))}
          </div>
          {!locked && (
            <button className="btn btn-primary" onClick={() => run(() => updateCharacterAction(c.id, { name, description, attributes: attrs }))}>
              احفظ الشخصية
            </button>
          )}
        </fieldset>
        <div className="rounded-lg bg-surface-2 p-3 text-sm">
          <span className="label">الوصف الذي يُضاف لكل مشهد تظهر فيه:</span>
          <p>{props.descriptor}</p>
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-bold">الصور المرجعية</h2>
        <p className="text-sm text-muted">
          حدّدي دور كل صورة: الصورة الرئيسية (واحدة فقط)، الوجه، الملابس، الوضعية أو الزاوية. تُرسل تلقائيًا مع كل مشهد تظهر فيه الشخصية،
          والرئيسية أولًا، وهي الصورة التي تتحدث في «الصورة المتحدثة» وداخل الفيديو التفاعلي.
        </p>
        <ul className="flex flex-wrap gap-3">
          {props.references.map((r) => (
            <li key={r.id} className="w-32 space-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/assets/${r.id}`} alt={r.name ?? ""}
                className={`h-32 w-32 rounded-lg border object-cover ${r.role === "primary" ? "border-primary ring-2 ring-primary" : "border-line"}`} />
              <select aria-label="دور الصورة" className="field py-1 text-sm" value={r.role} disabled={locked || pending}
                onChange={(e) => run(() => setReferenceRoleAction(c.id, r.id, e.target.value as ReferenceRole))}>
                {REFERENCE_ROLES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
              {!locked && <button className="btn btn-sm w-full justify-center" disabled={pending} onClick={() => run(() => removeReferenceAction(c.id, r.id))}>إزالة</button>}
            </li>
          ))}
        </ul>
        {!locked && (
          <form className="flex flex-wrap items-center gap-2" action={(fd) => run(() => uploadReferencesAction(c.id, fd))}>
            <input type="file" name="files" accept="image/*" multiple className="text-sm" />
            <button className="btn btn-sm" disabled={pending}>ارفع الصور</button>
          </form>
        )}
      </section>

      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      {!locked && (
        <button className="btn btn-sm text-danger" disabled={pending}
          onClick={() => { if (confirm("حذف الشخصية؟ ستُزال من كل المشاهد.")) run(() => deleteCharacterAction(c.id)); }}>
          حذف الشخصية
        </button>
      )}
    </div>
  );
}
