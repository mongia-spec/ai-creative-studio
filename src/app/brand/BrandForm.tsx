"use client";

import type { BrandKit } from "@/lib/production";
import { saveBrandKitAction } from "../actions";
import { useAction } from "../projects/[id]/useAction";

export default function BrandForm({ kit }: { kit: BrandKit }) {
  const { pending, error, run } = useAction();
  return (
    <form className="card space-y-3 p-4" action={(fd) => run(() => saveBrandKitAction(fd))}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="b-name">اسم العلامة</label><input id="b-name" name="name" className="field" defaultValue={kit.name} /></div>
        <div><label className="label" htmlFor="b-wm">العلامة المائية</label><input id="b-wm" name="watermark" className="field" defaultValue={kit.watermark} placeholder="@حسابك" /></div>
        <div><label className="label" htmlFor="b-pc">اللون الأساسي</label><input id="b-pc" name="primary_color" type="color" className="h-10 w-full" defaultValue={kit.primary_color} /></div>
        <div><label className="label" htmlFor="b-tc">لون النص</label><input id="b-tc" name="text_color" type="color" className="h-10 w-full" defaultValue={kit.text_color} /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="b-cta">الدعوة الختامية (CTA)</label><input id="b-cta" name="cta" className="field" defaultValue={kit.cta} placeholder="تابعونا للمزيد" /></div>
      </div>
      <div className="space-y-2">
        <div className="label">الشعار</div>
        {kit.logo_asset_id && (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/assets/${kit.logo_asset_id}`} alt="الشعار" className="h-16 rounded bg-surface-2 p-1" />
            <label className="text-sm"><input type="checkbox" name="removeLogo" value="1" /> إزالة الشعار</label>
          </div>
        )}
        <input type="file" name="logo" accept="image/*" className="text-sm" aria-label="الشعار" />
      </div>
      <button className="btn btn-primary" disabled={pending}>احفظي الهوية</button>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </form>
  );
}
