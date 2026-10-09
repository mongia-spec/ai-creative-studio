import { getDb } from "@/db/client";
import { getDefaultWorkspaceId } from "@/lib/workspace";
import { listAudio } from "@/lib/audio";
import { listCharacters } from "@/lib/characters";
import AudioRecorder from "@/app/components/AudioRecorder";
import AudioLibrary from "@/app/components/AudioLibrary";

export const dynamic = "force-dynamic";

export default async function AudioPage() {
  const db = await getDb();
  const ws = await getDefaultWorkspaceId(db);
  const [items, characters] = await Promise.all([listAudio(db, ws), listCharacters(db, ws)]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">مكتبة الصوت</h1>
      <p className="text-muted">سجّلي صوتك أو ارفعي تسجيلًا، ثم استخدميه في المشاهد والصورة المتحدثة وصوت الشخصيات دون رفعه من جديد.</p>
      <AudioRecorder />
      <AudioLibrary items={items} characters={characters.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
