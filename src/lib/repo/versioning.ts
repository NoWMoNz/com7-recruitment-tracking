import { TABS, type TabName } from "@/lib/sheets/schema";
import { ConflictError } from "./types";

function hasColumn(tab: TabName, key: string): boolean {
  return TABS[tab].columns.some((c) => c.key === key);
}

/** Applies a patch with optimistic version check. Shared by every Repo implementation. */
export function applyPatch(
  tab: TabName,
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
  expectedVersion: number | undefined,
  now: Date = new Date(),
): Record<string, unknown> {
  const versioned = hasColumn(tab, "version");
  const currentVersion = Number(current.version ?? 0);
  if (versioned && expectedVersion !== undefined && expectedVersion !== currentVersion) {
    throw new ConflictError();
  }
  const next: Record<string, unknown> = { ...current, ...patch };
  if (versioned) next.version = currentVersion + 1;
  if (hasColumn(tab, "updated_at")) next.updated_at = now.toISOString();
  return next;
}
