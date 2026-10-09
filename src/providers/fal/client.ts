/**
 * Minimal fal.ai queue client (no SDK dependency): submit → poll → result → download.
 * Used only when PROVIDERS_MODE=live and FAL_KEY is set; nothing here runs in mock mode or tests
 * unless a test injects `fetch`.
 */
const QUEUE = "https://queue.fal.run";

export function falConfigured() {
  return process.env.PROVIDERS_MODE === "live" && !!process.env.FAL_KEY;
}

export const dataUri = (f: { bytes: Uint8Array; mimeType: string }) => `data:${f.mimeType};base64,${Buffer.from(f.bytes).toString("base64")}`;

export async function falRun<T>(model: string, input: Record<string, unknown>, opts: { fetch?: typeof fetch; timeoutMs?: number; pollMs?: number } = {}): Promise<{ data: T; requestId: string }> {
  const f = opts.fetch ?? fetch;
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("مفتاح fal.ai غير مضبوط");
  const headers = { Authorization: `Key ${key}`, "Content-Type": "application/json" };
  const sub = await f(`${QUEUE}/${model}`, { method: "POST", headers, body: JSON.stringify(input) });
  if (!sub.ok) throw new Error(`fal.ai رفض الطلب (${sub.status}): ${(await sub.text()).slice(0, 300)}`);
  const { request_id, status_url, response_url } = await sub.json() as { request_id: string; status_url: string; response_url: string };
  const deadline = Date.now() + (opts.timeoutMs ?? 15 * 60_000);
  for (;;) {
    const st = await f(status_url, { headers });
    const { status } = await st.json() as { status: string };
    if (status === "COMPLETED") break;
    if (status !== "IN_QUEUE" && status !== "IN_PROGRESS") throw new Error(`fal.ai: حالة غير متوقعة ${status}`);
    if (Date.now() > deadline) throw new Error("fal.ai: انتهت مهلة الانتظار");
    await new Promise((r) => setTimeout(r, opts.pollMs ?? 3000));
  }
  const res = await f(response_url, { headers });
  if (!res.ok) throw new Error(`fal.ai: فشل التوليد (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return { data: await res.json() as T, requestId: request_id };
}

/** Results live on fal's CDN for a limited time: always copy them into our own storage. */
export async function falDownload(url: string, f: typeof fetch = fetch) {
  const r = await f(url);
  if (!r.ok) throw new Error(`تعذّر تنزيل نتيجة fal.ai (${r.status})`);
  return { bytes: new Uint8Array(await r.arrayBuffer()), mimeType: (r.headers.get("content-type") ?? "").split(";")[0] };
}
