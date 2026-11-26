import "server-only";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { sheetId, sheetsValuesApi } from "@/lib/sheets/client";
import type { TabName } from "@/lib/sheets/schema";
import { fetchTabValues } from "./sheets-repo";

export const tabTag = (tab: TabName) => `sheet:${tab}`;

/**
 * Tabs that people rarely edit. They are kept 5 minutes instead of 1, so most page loads skip these reads
 * (the dashboard alone reads about fourteen tabs). Saving through the web still expires them at once;
 * only a hand edit in the Sheet itself takes up to 5 minutes to show. Users is deliberately not here:
 * switching someone off in the Sheet must lock them out within a minute.
 */
const SLOW_TABS: ReadonlySet<TabName> = new Set<TabName>(["Branches", "Positions", "SourcingChannels", "RecruiterAssignments", "Settings", "Quota"]);

async function readSlow(tab: TabName): Promise<unknown[][]> {
  "use cache";
  cacheTag(tabTag(tab));
  cacheLife({ stale: 300, revalidate: 300, expire: 900 });
  return fetchTabValues(sheetsValuesApi(), sheetId(), tab);
}

async function readFast(tab: TabName): Promise<unknown[][]> {
  "use cache";
  cacheTag(tabTag(tab));
  cacheLife({ stale: 60, revalidate: 60, expire: 300 });
  return fetchTabValues(sheetsValuesApi(), sheetId(), tab);
}

/** Raw tab values, shared across requests for up to ~60 seconds (~5 minutes for rarely edited tabs). */
export async function readTabCached(tab: TabName): Promise<unknown[][]> {
  return SLOW_TABS.has(tab) ? readSlow(tab) : readFast(tab);
}

/** Expire immediately so the writer (and everyone else) reads fresh data next request. */
export async function invalidateTab(tab: TabName): Promise<void> {
  revalidateTag(tabTag(tab), { expire: 0 });
}
