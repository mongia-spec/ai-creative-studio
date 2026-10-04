/**
 * Background worker: processes queued generation jobs from Postgres.
 * Phase 1 mocks finish instantly inside the web request, so this is only needed
 * for retries/backoff and for real (slow) providers later. Run: npm run worker
 * Note: local PGlite allows one process per data folder, so stop the web app before running
 * the worker locally. With hosted Postgres (Supabase) both run side by side.
 */
import { getDb } from "../src/db/client";
import "../src/lib/job-handlers";
import { processQueue } from "../src/lib/jobs";

async function main() {
  const db = await getDb();
  const once = process.argv.includes("--once");
  console.log("worker started");
  for (;;) {
    const n = await processQueue(db, 20);
    if (n) console.log(`processed ${n} job(s)`);
    if (once) process.exit(0);
    await new Promise((r) => setTimeout(r, 2000));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
