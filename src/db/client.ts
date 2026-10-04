import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * Database access. Locally we run real PostgreSQL in-process via PGlite (free, no server).
 * Everything goes through `Db`, so moving to Supabase/hosted Postgres later only swaps this file.
 */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

type Queryable = Pick<PGlite, "query">;

function wrap(conn: Queryable, txFn?: PGlite["transaction"]): Db {
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const res = await conn.query<T>(sql, params);
      return res.rows;
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>) {
      if (!txFn) return fn(this); // already inside a transaction
      return txFn.call(conn as PGlite, (tx) => fn(wrap(tx))) as Promise<T>;
    },
  };
}

const MIGRATIONS_DIR = path.join(process.cwd(), "src", "db", "migrations");

async function migrate(db: Db) {
  await db.query(`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
  const applied = new Set((await db.query<{ name: string }>(`select name from schema_migrations`)).map((r) => r.name));
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    await db.transaction(async (tx) => {
      for (const stmt of splitSql(sql)) await tx.query(stmt);
      await tx.query(`insert into schema_migrations(name) values ($1)`, [file]);
    });
  }
}

function splitSql(sql: string): string[] {
  return sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function createDb(dataDir?: string): Promise<Db> {
  const pg = dataDir ? new PGlite(dataDir) : new PGlite(); // no dataDir = in-memory (tests)
  await pg.waitReady;
  const db = wrap(pg, pg.transaction);
  await migrate(db);
  return db;
}

const g = globalThis as unknown as { __acsDb?: Promise<Db> };

/** App-wide singleton (survives Next.js hot reloads). */
export function getDb(): Promise<Db> {
  if (!g.__acsDb) {
    const dir = path.resolve(process.env.DATA_DIR ?? ".data", "pglite");
    fs.mkdirSync(dir, { recursive: true });
    g.__acsDb = createDb(dir);
  }
  return g.__acsDb;
}

/** Tests inject an in-memory database here. */
export function setDb(db: Db) {
  g.__acsDb = Promise.resolve(db);
}
