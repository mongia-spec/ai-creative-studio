import { getDb } from "@/db/client";
import { getDefaultWorkspaceId } from "@/lib/workspace";
import { listAudio } from "@/lib/audio";
import { listCharacters } from "@/lib/characters";
import { PLATFORM_PRESETS, STYLES } from "@/config/platform-presets";
import { PROJECT_KINDS } from "@/lib/audio-story";
import StoryWizard from "./StoryWizard";

export const dynamic = "force-dynamic";

export default async function AudioStoryPage() {
  const db = await getDb();
  const ws = await getDefaultWorkspaceId(db);
  const [audio, characters, [media]] = await Promise.all([
    listAudio(db, ws), listCharacters(db, ws),
    db.query<{ images: number; videos: number }>(`select count(*) filter (where kind='image')::int images, count(*) filter (where kind='video')::int videos from assets where workspace_id=$1 and source='upload'`, [ws]),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">من تسجيل صوتي إلى فيديو</h1>
      <p className="text-muted">صوت الراوي ← نص ← مشاهد ولقطات ← حركات مرتبطة بتوقيت التسجيل ← فيديو من أصولك الموجودة. تُنشأ الشخصيات من النص، وتتحرك ولا تتكلم.</p>
      <div className="rounded-lg bg-surface-2 p-3 text-sm">
        <p>المتاح للمطابقة الآن: {characters.length} شخصيات، {media.images} صور، {media.videos} مقاطع فيديو مرفوعة.</p>
        <p className="text-muted">سمّي الصور والمقاطع بأسماء تصف محتواها (مثل «سالمة تشرب اللبن») لتُختار تلقائيًا للّقطة المناسبة.</p>
      </div>
      <StoryWizard
        audio={audio.map((a) => ({ id: a.id, name: a.name ?? "تسجيل", duration: a.duration_sec == null ? null : Number(a.duration_sec) }))}
        presets={PLATFORM_PRESETS.map((p) => ({ id: p.id, label: p.label }))}
        styles={STYLES.map((x) => ({ id: x.id, label: x.label }))}
        kinds={PROJECT_KINDS.map(([id, label]) => ({ id, label }))}
      />
    </div>
  );
}
