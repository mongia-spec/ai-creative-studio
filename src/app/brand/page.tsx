import { getDb } from "@/db/client";
import { getDefaultWorkspaceId } from "@/lib/workspace";
import { getBrandKit } from "@/lib/production";
import BrandForm from "./BrandForm";

export const dynamic = "force-dynamic";

export default async function BrandPage() {
  const db = await getDb();
  const kit = await getBrandKit(db, await getDefaultWorkspaceId(db));
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">هوية العلامة</h1>
      <p className="text-muted">تُضاف إلى الفيديو المصدَّر عند اختيارها: الشعار أو الاسم في الزاوية داخل المنطقة الآمنة، وبطاقة دعوة في النهاية بلون علامتك.</p>
      <BrandForm kit={kit} />
    </div>
  );
}
