import { getDb } from "@/db/client";
import { getDefaultWorkspaceId } from "@/lib/workspace";
import { listCharacters } from "@/lib/characters";
import NewLesson from "./NewLesson";

export const dynamic = "force-dynamic";

export default async function InteractiveVideoPage() {
  const db = await getDb();
  const chars = await listCharacters(db, await getDefaultWorkspaceId(db));
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">فيديو تفاعلي من فيديو جاهز</h1>
      <p className="text-muted">ارفعي فيديو منتهيًا، ثم أضيفي أسئلة تطرحها الشخصية عند ثوانٍ محددة. يتوقف الفيديو ليجيب الطلاب بتسجيل صوتي، ويستطيعون سؤال الشخصية في أي لحظة فيتوقف لتجيبهم.</p>
      <NewLesson characters={chars.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
