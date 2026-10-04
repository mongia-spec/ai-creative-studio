"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { askCharacterAction, type AskResponse } from "../ask-actions";
import type { Tier } from "@/lib/conversation";

export const TIER_LABEL: Record<Tier, string> = { text: "نص", voice: "صوت", avatar: "شخصية متحدثة" };

type Turn = { q: string; r: Extract<AskResponse, { ok: true }> };

/* Minimal typing for the browser's speech recognition (not in the DOM lib). */
type SR = { lang: string; interimResults: boolean; onresult: (e: { results: { 0: { transcript: string } }[] }) => void; onend: () => void; onerror: () => void; start(): void; stop(): void };
function getRecognition(): (new () => SR) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Ask a character. Used in Character Test Mode and inside the interactive player, so both
 * behave the same: answers from the knowledge base, saved voice and face, follow-up context.
 */
export default function AskPanel(props: {
  characterId: string; characterName: string; avatarAssetId: string | null; channel: "test" | "player"; projectId?: string | null;
  defaultTier?: Tier; compact?: boolean; showSources?: boolean; onTurn?: (t: Turn) => void;
}) {
  const [question, setQuestion] = useState("");
  const [tier, setTier] = useState<Tier>(props.defaultTier ?? "text");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [listening, setListening] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const recRef = useRef<SR | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const last = turns.at(-1);

  useEffect(() => setMicSupported(!!getRecognition()), []);
  useEffect(() => endRef.current?.scrollIntoView({ block: "nearest" }), [turns.length]);

  function ask(q = question) {
    if (!q.trim()) return;
    setError(null);
    start(async () => {
      const r = await askCharacterAction({ characterId: props.characterId, question: q, tier, channel: props.channel, conversationId, projectId: props.projectId ?? null });
      if (!r.ok) { setError(r.error); return; }
      setConversationId(r.conversationId);
      const t = { q, r };
      setTurns((x) => [...x, t]);
      setQuestion("");
      props.onTurn?.(t);
    });
  }

  function mic() {
    const R = getRecognition();
    if (!R) return;
    if (listening) { recRef.current?.stop(); return; }
    const rec = new R();
    rec.lang = "ar";
    rec.interimResults = false;
    rec.onresult = (e) => { const text = e.results[0][0].transcript; setQuestion(text); ask(text); };
    rec.onend = () => setListening(false);
    rec.onerror = () => { setListening(false); setError("لم يُلتقط الصوت. اكتب سؤالك بدلًا من ذلك."); };
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  return (
    <div className="space-y-3">
      <div className={`flex gap-3 ${props.compact ? "items-end" : "flex-col sm:flex-row"}`}>
        <div className={`relative shrink-0 overflow-hidden rounded-xl bg-surface-2 ${props.compact ? "h-28 w-24" : "aspect-[4/5] w-full sm:w-56"}`}>
          {last?.r.videoAssetId ? (
            <video key={last.r.videoAssetId} src={`/api/assets/${last.r.videoAssetId}`} autoPlay playsInline className="h-full w-full object-cover" data-testid="avatar-video" />
          ) : props.avatarAssetId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/assets/${props.avatarAssetId}`} alt={props.characterName} className="h-full w-full object-cover" />
          ) : <span className="flex h-full items-center justify-center text-3xl">🙂</span>}
          {last?.r.audioAssetId && !last.r.videoAssetId && <audio key={last.r.audioAssetId} src={`/api/assets/${last.r.audioAssetId}`} autoPlay />}
        </div>
        <div className="min-w-0 flex-1 space-y-2" aria-live="polite">
          {turns.length === 0 && <p className="text-sm text-muted">اسأل {props.characterName} عن الدرس، بأي صياغة.</p>}
          <div className={`space-y-2 overflow-y-auto ${props.compact ? "max-h-40" : "max-h-96"}`}>
            {turns.map((t, i) => (
              <div key={i} className="space-y-1 text-sm">
                <p className="ms-auto w-fit max-w-[85%] rounded-2xl bg-surface-2 px-3 py-1.5">{t.q}</p>
                <div className={`w-fit max-w-[90%] rounded-2xl px-3 py-1.5 ${t.r.inScope ? "bg-primary text-primary-ink" : "bg-warn/20"}`} data-testid="answer">
                  <span className="font-semibold">{props.characterName}: </span>{t.r.answer}
                </div>
                {props.showSources && (
                  <div className="text-xs text-muted">
                    {t.r.inScope ? "ضمن المعرفة" : "خارج المعرفة: أعادت الحديث للموضوع"}
                    {t.r.cached && " · ♻️ من الذاكرة المؤقتة"}{t.r.usedContext && " · فهمت السؤال من السياق السابق"}
                    {t.r.sources.length > 0 && <ul className="list-disc ps-5">{t.r.sources.map((s, k) => <li key={k}>«{s.title}»: {s.text}</li>)}</ul>}
                    {t.r.notes.map((n) => <p key={n}>{n}</p>)}
                  </div>
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>
        </div>
      </div>
      <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <input className="field min-w-0 flex-1" value={question} onChange={(e) => setQuestion(e.target.value)} aria-label={`سؤال إلى ${props.characterName}`}
          placeholder={`اسأل ${props.characterName}…`} disabled={pending} />
        {micSupported && (
          <button type="button" className={`btn btn-sm ${listening ? "btn-primary" : ""}`} onClick={mic} aria-label="اسأل بصوتك">{listening ? "⏹" : "🎙️"}</button>
        )}
        <select className="field w-auto py-1 text-sm" value={tier} onChange={(e) => setTier(e.target.value as Tier)} aria-label="طريقة الإجابة">
          {(Object.keys(TIER_LABEL) as Tier[]).map((k) => <option key={k} value={k}>{TIER_LABEL[k]}</option>)}
        </select>
        <button className="btn btn-sm btn-primary" disabled={pending || !question.trim()}>{pending ? "…" : "اسأل"}</button>
        {turns.length > 0 && (
          <button type="button" className="btn btn-sm" onClick={() => { setTurns([]); setConversationId(null); }}>محادثة جديدة</button>
        )}
      </form>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}
