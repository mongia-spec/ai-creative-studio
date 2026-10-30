"use client";

import { STYLE_GROUPS, type StyleOption } from "@/config/styles";

/** Visual style cards grouped by use, with a palette swatch so each style is recognisable at a glance. */
export default function StylePicker({ options, value, onChange, disabled }: { options: StyleOption[]; value: string; onChange: (id: string) => void; disabled?: boolean }) {
  const groups = (Object.keys(STYLE_GROUPS) as StyleOption["group"][]).map((g) => ({ g, items: options.filter((o) => o.group === g) })).filter((x) => x.items.length);
  return (
    <div className="space-y-3" role="radiogroup" aria-label="الأسلوب البصري" data-testid="style-picker">
      {groups.map(({ g, items }) => (
        <div key={g}>
          <p className="mb-1 text-sm font-bold text-muted">{STYLE_GROUPS[g]}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((o) => {
              const on = o.id === value;
              return (
                <button key={o.id} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => onChange(o.id)}
                  data-style={o.id}
                  className={`overflow-hidden rounded-lg border text-start transition ${on ? "border-primary ring-2 ring-primary" : "border-line hover:border-primary/60"}`}>
                  <span className="flex h-12 items-center justify-center text-2xl" style={{ background: `linear-gradient(135deg, ${o.palette[0]}, ${o.palette[1]} 60%, ${o.palette[2]})` }} aria-hidden>{o.emoji}</span>
                  <span className="block p-2">
                    <span className="block font-bold">{on ? "✓ " : ""}{o.label}</span>
                    <span className="block text-xs text-muted">{o.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-xs text-muted">
        الأسلوب يُرسَل مع وصف كل لقطة إلى مزوّد الصور والفيديو عند ربطه. وفي المسودة المجانية يُطبَّق عليها فلتر محلي يقرّب الإحساس فقط، ولا يعيد رسم الصور بهذا الأسلوب.
      </p>
    </div>
  );
}
