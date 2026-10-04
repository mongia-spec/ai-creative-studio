"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "../../actions";

/** Runs a server action with a pending flag and an Arabic error message. */
export function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error);
    });
  return { pending, error, run };
}
