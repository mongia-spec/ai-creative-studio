import { getDb } from "@/db/client";
import { getDefaultWorkspaceId } from "@/lib/workspace";
import { listCharacters } from "@/lib/characters";
import { getProvider } from "@/providers/registry";
import { listAudio } from "@/lib/audio";
import TalkingPhotoForm from "./TalkingPhotoForm";

export const dynamic = "force-dynamic";

export default async function TalkingPhotoPage({ searchParams }: { searchParams: Promise<{ character?: string }> }) {
  const { character } = await searchParams;
  const db = await getDb();
  const ws = await getDefaultWorkspaceId(db);
  const [characters, audio] = await Promise.all([listCharacters(db, ws), listAudio(db, ws)]);
  const recent = await db.query<{ id: string; created_at: string }>(
    `select id, created_at from assets where workspace_id=$1 and source='generated' and name='talking' order by created_at desc limit 6`, [ws]);
  const lip = getProvider("lipsync").info;
  const voice = getProvider("voice").info;
  const notes = [voice.support?.voiceConsistency?.note, lip.support?.talkingAvatar?.note, lip.support?.lipSync?.note].filter(Boolean) as string[];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">الصورة المتحدثة</h1>
      <p className="text-muted">صورة + نص (أو صوت مسجّل) ← مقطع تتحدث فيه الصورة نفسها دون إعادة رسم الوجه. يدعم العربية والنص المشكول.</p>
      {(lip.isMock || voice.isMock) && (
        <div className="rounded-lg bg-warn/20 p-3 text-sm">
          <p className="font-semibold">يعمل الآن بمزوّد تجريبي مجاني على هذا الجهاز:</p>
          <ul className="list-disc ps-5">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
          <p>للكلام الحقيقي وتحريك الشفاه يلزم مزوّد صوت ومزوّد شخصية متحدثة، ويُضافان بعد موافقتك فقط.</p>
        </div>
      )}
      <TalkingPhotoForm
        characters={characters.map((c) => ({ id: c.id, name: c.name, cover: c.cover_asset_id ?? null, voiceSample: c.voice_sample_asset_id ?? null }))}
        audio={audio.map((a) => ({ id: a.id, name: a.name ?? "تسجيل" }))}
        initialCharacter={characters.some((c) => c.id === character) ? character! : ""}
      />
      {recent.length > 0 && (
        <section className="card space-y-2 p-4">
          <h2 className="font-bold">آخر المقاطع</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {recent.map((r) => <video key={r.id} src={`/api/assets/${r.id}`} controls preload="metadata" className="w-full rounded-lg bg-black" />)}
          </div>
        </section>
      )}
    </div>
  );
}
