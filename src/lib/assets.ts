import crypto from "node:crypto";
import type { Db } from "@/db/client";
import { getStorage } from "./storage";

export interface Asset {
  id: string;
  workspace_id: string;
  project_id: string | null;
  kind: "image" | "video" | "audio" | "document" | "other";
  source: "upload" | "generated" | "export";
  name: string | null;
  mime_type: string;
  byte_size: number;
  storage_key: string;
  checksum: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg", "image/gif": "gif",
  "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/webm": "webm",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
  "application/pdf": "pdf", "text/plain": "txt",
};

export function kindOf(mime: string): Asset["kind"] {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf" || mime === "text/plain") return "document";
  return "other";
}

export async function saveAsset(
  db: Db,
  input: {
    workspaceId: string; projectId?: string | null; source: Asset["source"]; name?: string;
    mimeType: string; bytes: Uint8Array; width?: number; height?: number; providerRef?: unknown;
  },
): Promise<Asset> {
  const ext = EXT[input.mimeType];
  if (!ext) throw new Error(`نوع الملف غير مدعوم: ${input.mimeType}`);
  if (input.bytes.byteLength > MAX_UPLOAD_BYTES) throw new Error("حجم الملف أكبر من 50 ميغابايت");
  const checksum = crypto.createHash("sha256").update(input.bytes).digest("hex");

  // Reuse: identical uploaded file in the same workspace is stored once.
  if (input.source === "upload") {
    const [dup] = await db.query<Asset>(
      `select * from assets where workspace_id=$1 and checksum=$2 and source='upload' limit 1`, [input.workspaceId, checksum],
    );
    if (dup) return dup;
  }

  const id = crypto.randomUUID();
  const key = `${input.workspaceId}/${id}.${ext}`;
  await getStorage().put(key, input.bytes);
  const [row] = await db.query<Asset>(
    `insert into assets(id, workspace_id, project_id, kind, source, name, mime_type, byte_size, storage_key, checksum, width, height, provider_ref)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *`,
    [id, input.workspaceId, input.projectId ?? null, kindOf(input.mimeType), input.source, input.name ?? null,
     input.mimeType, input.bytes.byteLength, key, checksum, input.width ?? null, input.height ?? null,
     input.providerRef ? JSON.stringify(input.providerRef) : null],
  );
  return row;
}

export async function getAsset(db: Db, id: string): Promise<Asset | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db.query<Asset>(`select * from assets where id=$1`, [id]);
  return row ?? null;
}

export async function listProjectAssets(db: Db, projectId: string, source?: Asset["source"]): Promise<Asset[]> {
  return db.query<Asset>(
    `select * from assets where project_id=$1 and ($2::text is null or source=$2) order by created_at desc`,
    [projectId, source ?? null],
  );
}

export async function readAssetBytes(asset: Asset) {
  return getStorage().get(asset.storage_key);
}
