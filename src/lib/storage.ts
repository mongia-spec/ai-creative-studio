import fs from "node:fs/promises";
import path from "node:path";

/** File storage behind an interface: local disk now, Supabase Storage / S3 later. */
export interface StorageAdapter {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  remove(key: string): Promise<void>;
}

export class LocalDiskStorage implements StorageAdapter {
  constructor(private root: string) {}
  private resolve(key: string) {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Invalid storage key");
    return p;
  }
  async put(key: string, bytes: Uint8Array) {
    const p = this.resolve(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, bytes);
  }
  async get(key: string) {
    return new Uint8Array(await fs.readFile(this.resolve(key)));
  }
  async remove(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }
}

const g = globalThis as unknown as { __acsStorage?: StorageAdapter };
export function getStorage(): StorageAdapter {
  g.__acsStorage ??= new LocalDiskStorage(path.resolve(process.env.DATA_DIR ?? ".data", "storage"));
  return g.__acsStorage;
}
export function setStorage(s: StorageAdapter) {
  g.__acsStorage = s;
}
