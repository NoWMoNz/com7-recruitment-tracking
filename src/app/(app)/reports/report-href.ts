/** Builds /reports (or /api/export) URLs from the current params plus changes; empty values are dropped. */
export function reportQuery(current: Record<string, string | undefined>, patch: Record<string, string | undefined> = {}): string {
  const merged = { ...current, ...patch };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, v);
  return qs.toString();
}
