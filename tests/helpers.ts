import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { createDb, setDb } from "@/db/client";
import { LocalDiskStorage, setStorage } from "@/lib/storage";
import { getDefaultWorkspaceId } from "@/lib/workspace";

export async function freshEnv() {
  const db = await createDb(); // in-memory Postgres
  setDb(db);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acs-"));
  setStorage(new LocalDiskStorage(dir));
  const workspaceId = await getDefaultWorkspaceId(db);
  return { db, workspaceId, storageDir: dir };
}
