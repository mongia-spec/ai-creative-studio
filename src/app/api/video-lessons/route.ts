import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getDefaultWorkspaceId } from "@/lib/workspace";
import { createVideoLesson } from "@/lib/interactive";
import { normalizeMime } from "@/lib/assets";

/** Upload a finished video and turn it into an interactive lesson (a route: videos exceed the server-action body limit). */
export async function POST(req: Request) {
  try {
    const fd = await req.formData();
    const f = fd.get("file");
    if (!(f instanceof File) || f.size === 0) throw new Error("اختاري ملف الفيديو أولًا");
    const db = await getDb();
    const ws = await getDefaultWorkspaceId(db);
    const characterId = String(fd.get("characterId") ?? "") || null;
    if (characterId) {
      const [c] = await db.query(`select 1 from characters where id=$1 and workspace_id=$2`, [characterId, ws]);
      if (!c) throw new Error("الشخصية غير موجودة");
    }
    const r = await createVideoLesson(db, {
      workspaceId: ws, title: String(fd.get("title") ?? ""), bytes: new Uint8Array(await f.arrayBuffer()),
      mimeType: normalizeMime(f.type || "video/mp4"), characterId, storyText: String(fd.get("story") ?? ""),
    });
    return NextResponse.json({ ok: true, projectId: r.projectId });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "حدث خطأ غير متوقع" }, { status: 400 });
  }
}
