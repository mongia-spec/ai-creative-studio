import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** Local FFmpeg (free, LGPL/GPL binary run as a separate process; not bundled). */
const BIN = process.env.FFMPEG_PATH || "ffmpeg";
let available: Promise<boolean> | null = null;

export function hasFfmpeg(): Promise<boolean> {
  available ??= new Promise((resolve) => execFile(/*turbopackIgnore: true*/ BIN, ["-version"], (err) => resolve(!err)));
  return available;
}

export function runFfmpeg(args: string[], timeoutMs = 120000): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(/*turbopackIgnore: true*/ BIN, ["-hide_banner", "-loglevel", "error", "-y", ...args], { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (err, _out, stderr) => {
      if (err) reject(new Error(`FFmpeg: ${String(stderr || err.message).slice(0, 500)}`));
      else resolve();
    });
  });
}

/** Run `fn` inside a fresh temp folder that is always removed afterwards. */
export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "acs-ff-"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

export const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg", "image/gif": "gif",
  "audio/wav": "wav", "audio/x-wav": "wav", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/webm": "webm",
  "video/mp4": "mp4", "video/webm": "webm",
};
