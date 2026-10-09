import type { Db } from "@/db/client";
import { getPlan } from "@/config/plans";

/** Usage, credits and admin stats. Read-only views over provider_calls, credit_ledger and jobs. */
export async function workspaceUsage(db: Db, workspaceId: string) {
  const [ws] = await db.query<{ plan: string; name: string }>(`select plan, name from workspaces where id=$1`, [workspaceId]);
  const [bal] = await db.query<{ balance: string }>(`select coalesce(sum(delta),0) balance from credit_ledger where workspace_id=$1`, [workspaceId]);
  const byCapability = await db.query<{ capability: string; calls: number; units: string; cost: string; mock: number }>(
    `select capability, count(*)::int calls, coalesce(sum(units),0) units, coalesce(sum(cost_usd),0) cost, count(*) filter (where is_mock)::int mock
     from provider_calls where workspace_id=$1 and created_at >= date_trunc('month', now()) group by capability order by capability`, [workspaceId]);
  const [counts] = await db.query<{ projects: number; characters: number; exports: number; storage: string }>(
    `select (select count(*)::int from projects where workspace_id=$1 and status<>'archived') projects,
            (select count(*)::int from characters where workspace_id=$1) characters,
            (select count(*)::int from assets where workspace_id=$1 and source='export') exports,
            (select coalesce(sum(byte_size),0) from assets where workspace_id=$1) storage`, [workspaceId]);
  const jobs = await db.query<{ status: string; n: number }>(
    `select status, count(*)::int n from generation_jobs where workspace_id=$1 group by status`, [workspaceId]);
  const [reuse] = await db.query<{ hits: number }>(
    `select coalesce(sum(hits),0)::int hits from answer_cache a join characters c on c.id=a.character_id where c.workspace_id=$1`, [workspaceId]);
  return {
    plan: getPlan(ws?.plan ?? "free"), workspaceName: ws?.name ?? "", balance: Number(bal.balance),
    byCapability: byCapability.map((r) => ({ ...r, units: Number(r.units), cost: Number(r.cost) })),
    totalCostUsd: byCapability.reduce((a, r) => a + Number(r.cost), 0),
    counts: { ...counts, storage: Number(counts.storage) }, jobs, cachedAnswers: reuse.hits,
  };
}

export async function creditHistory(db: Db, workspaceId: string) {
  return db.query<{ delta: string; reason: string; created_at: string }>(
    `select delta, reason, created_at from credit_ledger where workspace_id=$1 order by created_at desc limit 20`, [workspaceId]);
}
