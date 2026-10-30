"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import StylePicker from "@/app/components/StylePicker";
import { setProjectStyleAction } from "@/app/actions";
import type { StyleOption } from "@/config/styles";

/** Change the project's style after creation; what was already generated keeps its look. */
export default function StyleSwitcher({ projectId, options, initial }: { projectId: string; options: StyleOption[]; initial: string }) {
  const router = useRouter();
  const [style, setStyle] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const current = options.find((o) => o.id === style);
  function pick(id: string) {
    const prev = style;
    setStyle(id);
    setError(null);
    start(async () => {
      const r = await setProjectStyleAction(projectId, id);
      if (!r.ok) { setStyle(prev); setError(r.error); } else router.refresh();
    });
  }
  return (
    <details className="card p-4" data-testid="style-switcher">
      <summary className="cursor-pointer font-bold">🎨 الأسلوب البصري: {current ? `${current.emoji} ${current.label}` : style}{pending ? " · جارٍ الحفظ…" : ""}</summary>
      <div className="mt-3 space-y-2">
        <p className="text-sm text-muted">التغيير يسري على المعاينات والتوليد الجديد وعلى التصدير القادم. ما وُلّد سابقًا يبقى كما هو حتى تعيدي توليده.</p>
        <StylePicker options={options} value={style} onChange={pick} disabled={pending} />
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </details>
  );
}
