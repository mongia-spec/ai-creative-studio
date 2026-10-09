import { getDb } from "@/db/client";
import { getAsset, readAssetBytes } from "@/lib/assets";

const HEADERS = {
  "Cache-Control": "private, max-age=31536000, immutable",
  "X-Content-Type-Options": "nosniff",
  "Accept-Ranges": "bytes",
  // Uploaded files (e.g. SVG) must never run scripts in our origin.
  "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
};

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = await getAsset(await getDb(), id);
  if (!asset) return new Response("Not found", { status: 404 });
  const bytes = Buffer.from(await readAssetBytes(asset));
  const type = { "Content-Type": asset.mime_type };
  // Safari (iPhone/iPad) only plays audio and video when byte ranges are supported.
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (m && (m[1] || m[2])) {
    const size = bytes.length;
    let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    let end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    start = Math.max(0, start); end = Math.max(start, end);
    return new Response(bytes.subarray(start, end + 1), {
      status: 206,
      headers: { ...HEADERS, ...type, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(bytes, { headers: { ...HEADERS, ...type, "Content-Length": String(bytes.length) } });
}
