import { getDb } from "@/db/client";
import { getAsset, readAssetBytes } from "@/lib/assets";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = await getAsset(await getDb(), id);
  if (!asset) return new Response("Not found", { status: 404 });
  const bytes = await readAssetBytes(asset);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": asset.mime_type,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      // Uploaded files (e.g. SVG) must never run scripts in our origin.
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    },
  });
}
