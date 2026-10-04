import type { Db } from "@/db/client";
import type { Capability, ProviderInfo, QualityTier, Usage } from "@/providers/types";
import { getProvider } from "@/providers/registry";

/** Cost ledger: every provider call (mock or real) is logged with its units and price. */
export async function recordProviderCall(
  db: Db,
  args: { workspaceId: string; projectId?: string | null; jobId?: string | null; provider: ProviderInfo; usage: Usage },
) {
  const price = args.provider.pricing.unitPriceUsd;
  await db.query(
    `insert into provider_calls(workspace_id, project_id, job_id, capability, provider, model, is_mock, units, unit_type, unit_price_usd, cost_usd, external_ref)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [args.workspaceId, args.projectId ?? null, args.jobId ?? null, args.provider.capability, args.provider.id,
     args.usage.model ?? null, args.provider.isMock, args.usage.units, args.usage.unitType, price, price * args.usage.units,
     args.usage.externalRef ?? null],
  );
}

export interface SpendSummary {
  calls: number;
  mockCalls: number;
  totalUsd: number;
}

export async function spendSummary(db: Db, filter: { workspaceId?: string; projectId?: string }): Promise<SpendSummary> {
  const [r] = await db.query<{ calls: string; mock_calls: string; total: string }>(
    `select count(*) calls, count(*) filter (where is_mock) mock_calls, coalesce(sum(cost_usd),0) total
     from provider_calls where ($1::uuid is null or workspace_id=$1) and ($2::uuid is null or project_id=$2)`,
    [filter.workspaceId ?? null, filter.projectId ?? null],
  );
  return { calls: Number(r.calls), mockCalls: Number(r.mock_calls), totalUsd: Number(r.total) };
}

export interface EstimateLine {
  capability: Capability;
  label: string;
  units: number;
  unitType: string;
  provider: string;
  isMock: boolean;
  costUsd: number;
}

/**
 * Pre-generation estimate from the storyboard. Units are exact counts from the project;
 * prices come from whichever provider the router would pick (mocks are 0). Real prices are
 * filled in only when a real provider is approved and added.
 */
export function estimateFromScenes(
  scenes: { duration_sec: number | string; narration: string }[],
  tier: QualityTier = "draft",
): EstimateLine[] {
  const seconds = scenes.reduce((s, x) => s + Number(x.duration_sec), 0);
  const chars = scenes.reduce((s, x) => s + x.narration.length, 0);
  const lines: [Capability, string, number][] = [
    ["image", "صور معاينة للوحة القصة", scenes.length],
    ["video", "ثواني فيديو نهائي", seconds],
    ["voice", "أحرف تعليق صوتي", chars],
    ["music", "ثواني موسيقى", seconds],
  ];
  return lines.map(([capability, label, units]) => {
    const p = getProvider(capability, tier).info;
    return { capability, label, units, unitType: p.pricing.unitType, provider: p.name, isMock: p.isMock, costUsd: units * p.pricing.unitPriceUsd };
  });
}
