import { getDb } from "@/db/client";
import { getDefaultWorkspaceId } from "@/lib/workspace";
import { listPronunciations } from "@/lib/pronunciation";
import PronunciationEditor from "./PronunciationEditor";

export const dynamic = "force-dynamic";

export default async function PronunciationPage() {
  const db = await getDb();
  const entries = await listPronunciations(db, await getDefaultWorkspaceId(db));
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">قاموس النطق</h1>
      <p className="text-muted">
        كلمات تُنطق بطريقة محددة (أسماء، مصطلحات، كلمات تحتاج تشكيلًا). تُطبَّق تلقائيًا على كل نص قبل تحويله إلى صوت،
        في المشاهد والإجابات والصورة المتحدثة. النص المعروض للمشاهد لا يتغيّر.
      </p>
      <PronunciationEditor entries={entries} />
    </div>
  );
}
