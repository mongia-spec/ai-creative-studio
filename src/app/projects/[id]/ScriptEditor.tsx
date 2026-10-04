"use client";

import { useState } from "react";
import type { Script } from "@/lib/projects";
import { regenerateScriptAction, saveScriptAction } from "../../actions";
import { useAction } from "./useAction";

export default function ScriptEditor(props: { projectId: string; inputText: string; startType: string; script: Script | null }) {
  const { pending, error, run } = useAction();
  const [input, setInput] = useState(props.inputText);
  const [title, setTitle] = useState(props.script?.title ?? "");
  const [logline, setLogline] = useState(props.script?.logline ?? "");
  const [body, setBody] = useState(props.script?.body ?? "");
  const [seen, setSeen] = useState(props.script);
  if (seen !== props.script) {
    // Server sent a new script (e.g. after regeneration): reset local edits.
    setSeen(props.script);
    setTitle(props.script?.title ?? "");
    setLogline(props.script?.logline ?? "");
    setBody(props.script?.body ?? "");
  }
  const dirty = !!props.script && (title !== props.script.title || logline !== props.script.logline || body !== props.script.body);

  return (
    <section className="card space-y-4 p-4">
      <details open={!props.script}>
        <summary className="cursor-pointer font-bold">{props.startType === "idea" ? "الفكرة" : "النص الأصلي"}</summary>
        <textarea className="field mt-2" rows={props.startType === "idea" ? 3 : 8} value={input} onChange={(e) => setInput(e.target.value)} />
        <button className="btn mt-2" disabled={pending || input.trim().length < 3}
          onClick={() => {
            if (props.script && !confirm("سيُستبدل النص والمشاهد الحالية بنسخة جديدة. هل تريد المتابعة؟")) return;
            run(() => regenerateScriptAction(props.projectId, input));
          }}>
          {props.script ? "أعد توليد النص والمشاهد" : "ولّد النص والمشاهد"}
        </button>
      </details>

      {props.script && (
        <div className="space-y-3 border-t border-line pt-4">
          <h2 className="text-lg font-bold">النص</h2>
          <div>
            <label className="label" htmlFor="s-title">العنوان</label>
            <input id="s-title" className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="s-logline">الفكرة في سطر</label>
            <input id="s-logline" className="field" value={logline} onChange={(e) => setLogline(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="s-body">النص الكامل</label>
            <textarea id="s-body" className="field" rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <button className="btn btn-primary" disabled={!dirty || pending} onClick={() => run(() => saveScriptAction(props.projectId, { title, logline, body }))}>
            {dirty ? "احفظ النص" : "محفوظ"}
          </button>
        </div>
      )}
      {pending && <p className="text-sm text-muted">جارٍ التنفيذ…</p>}
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </section>
  );
}
