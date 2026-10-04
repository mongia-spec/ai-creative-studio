"use client";

import { useActionState } from "react";
import { createCharacterAction } from "./actions";

export default function NewCharacterForm() {
  const [state, action, pending] = useActionState(createCharacterAction, null);
  return (
    <form action={action} className="card flex flex-wrap items-end gap-3 p-4">
      <div className="min-w-40 flex-1">
        <label className="label" htmlFor="c-name">اسم الشخصية</label>
        <input id="c-name" name="name" required maxLength={80} className="field" placeholder="مثال: سلمى" />
      </div>
      <div className="min-w-60 flex-[2]">
        <label className="label" htmlFor="c-desc">وصف قصير</label>
        <input id="c-desc" name="description" className="field" placeholder="مثال: طفلة فضولية تحب الاستكشاف" />
      </div>
      <button className="btn btn-primary" disabled={pending}>{pending ? "جارٍ الإنشاء…" : "+ شخصية جديدة"}</button>
      {state && !state.ok && <p className="w-full text-sm text-danger" role="alert">{state.error}</p>}
    </form>
  );
}
