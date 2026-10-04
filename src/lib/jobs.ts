import crypto from "node:crypto";
import type { Db } from "@/db/client";
import type { Capability, QualityTier } from "@/providers/types";

/**
 * Postgres-backed generation job queue. Every generation is its own job: it can fail and be
 * retried alone, and a job with identical input that already succeeded is reused (no new cost).
 */
/** Provider capabilities, plus local rendering (FFmpeg) which calls no provider. */
export type JobCapability = Capability | "render";
export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface Job {
  id: string;
  workspace_id: string;
  project_id: string | null;
  type: string;
  capability: JobCapability;
  quality_tier: QualityTier;
  status: JobStatus;
  input: Record<string, unknown>;
  input_hash: string;
  output: Record<string, unknown> | null;
  error: string | null;
  provider: string | null;
  attempts: number;
  max_attempts: number;
  created_at: string;
  finished_at: string | null;
}

export interface JobContext {
  db: Db;
  job: Job;
  /** Handlers report which provider they used (stored on the job). */
  setProvider(id: string): void;
}
export type JobHandler = (ctx: JobContext) => Promise<Record<string, unknown>>;

const handlers = new Map<string, { capability: JobCapability; run: JobHandler }>();

export function registerJobHandler(type: string, capability: JobCapability, run: JobHandler) {
  handlers.set(type, { capability, run });
}

function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

export function hashInput(type: string, input: unknown) {
  return crypto.createHash("sha256").update(type + "\n" + stableStringify(input)).digest("hex");
}

export async function enqueueJob(
  db: Db,
  args: { workspaceId: string; projectId?: string | null; type: string; input: Record<string, unknown>; tier?: QualityTier; maxAttempts?: number },
): Promise<{ job: Job; reused: boolean }> {
  const h = handlers.get(args.type);
  if (!h) throw new Error(`Unknown job type: ${args.type}`);
  const inputHash = hashInput(args.type, args.input);
  const [prev] = await db.query<Job>(
    `select * from generation_jobs where workspace_id=$1 and type=$2 and input_hash=$3 and status in ('succeeded','queued','running')
     order by created_at desc limit 1`,
    [args.workspaceId, args.type, inputHash],
  );
  if (prev) return { job: prev, reused: true };
  const [job] = await db.query<Job>(
    `insert into generation_jobs(workspace_id, project_id, type, capability, quality_tier, input, input_hash, max_attempts)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
    [args.workspaceId, args.projectId ?? null, args.type, h.capability, args.tier ?? "draft",
     JSON.stringify(args.input), inputHash, args.maxAttempts ?? 3],
  );
  return { job, reused: false };
}

/** Atomically claim a queued job (SKIP LOCKED lets several workers share the queue). */
async function claim(db: Db, id?: string): Promise<Job | null> {
  const rows = await db.query<Job>(
    `update generation_jobs set status='running', attempts=attempts+1, locked_at=now(), updated_at=now()
     where id = (
       select id from generation_jobs
       where status='queued' and run_after <= now() and ($1::uuid is null or id=$1)
       order by created_at for update skip locked limit 1)
     returning *`,
    [id ?? null],
  );
  return rows[0] ?? null;
}

async function execute(db: Db, job: Job): Promise<Job> {
  const started = new Date();
  const h = handlers.get(job.type);
  let provider: string | null = null;
  try {
    if (!h) throw new Error(`Unknown job type: ${job.type}`);
    const output = await h.run({ db, job, setProvider: (p) => (provider = p) });
    await db.query(`insert into job_attempts(job_id, attempt, status, started_at) values ($1,$2,'succeeded',$3)`, [job.id, job.attempts, started]);
    const [done] = await db.query<Job>(
      `update generation_jobs set status='succeeded', output=$2, provider=$3, error=null, locked_at=null, finished_at=now(), updated_at=now()
       where id=$1 returning *`,
      [job.id, JSON.stringify(output), provider],
    );
    return done;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.query(`insert into job_attempts(job_id, attempt, status, error, started_at) values ($1,$2,'failed',$3,$4)`, [job.id, job.attempts, msg, started]);
    const final = job.attempts >= job.max_attempts;
    const [after] = await db.query<Job>(
      `update generation_jobs set status=$2, error=$3, provider=$4, locked_at=null, updated_at=now(),
         run_after = now() + make_interval(secs => power(2, attempts)::int),
         finished_at = case when $2='failed' then now() else null end
       where id=$1 returning *`,
      [job.id, final ? "failed" : "queued", msg, provider],
    );
    return after;
  }
}

/** Run one specific job now (used by the UI for instant mock results). */
export async function runJob(db: Db, id: string): Promise<Job> {
  const job = await claim(db, id);
  if (!job) return getJob(db, id) as Promise<Job>;
  return execute(db, job);
}

/** Worker loop body: process up to `limit` ready jobs. */
export async function processQueue(db: Db, limit = 10): Promise<number> {
  let n = 0;
  while (n < limit) {
    const job = await claim(db);
    if (!job) break;
    await execute(db, job);
    n++;
  }
  return n;
}

/** Manual retry of a failed job: gives it one more attempt, runnable immediately. */
export async function retryJob(db: Db, id: string): Promise<Job | null> {
  const [job] = await db.query<Job>(
    `update generation_jobs set status='queued', run_after=now(), max_attempts=greatest(max_attempts, attempts+1), error=null, updated_at=now()
     where id=$1 and status='failed' returning *`,
    [id],
  );
  return job ?? null;
}

export async function getJob(db: Db, id: string): Promise<Job | null> {
  const [j] = await db.query<Job>(`select * from generation_jobs where id=$1`, [id]);
  return j ?? null;
}

export async function listProjectJobs(db: Db, projectId: string, limit = 20): Promise<Job[]> {
  return db.query<Job>(`select * from generation_jobs where project_id=$1 order by created_at desc limit $2`, [projectId, limit]);
}
