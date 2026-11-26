import "server-only";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { sheetId, sheetsValuesApi } from "@/lib/sheets/client";
import type { TabName } from "@/lib/sheets/schema";
import { fetchTabsValues } from "./sheets-repo";

export const tabTag = (tab: TabName) => `sheet:${tab}`;

/**
 * Tabs that people rarely edit. A set of only these is kept 5 minutes instead of 1. Saving through the web
 * still expires them at once; only a hand edit in the Sheet itself takes up to 5 minutes to show. Users is
 * deliberately not here: switching someone off in the Sheet must lock them out within a minute.
 */
const SLOW_TABS: ReadonlySet<TabName> = new Set<TabName>(["Branches", "Positions", "SourcingChannels", "RecruiterAssignments", "Settings", "Quota"]);

/**
 * The tabs one page asks for together (sorted, so the same set is the same cache entry), read in one
 * request. The entry carries every tab's tag, so saving any of them expires it.
 */
export async function readTabsCached(tabs: TabName[]): Promise<unknown[][][]> {
  "use cache";
  cacheTag(...tabs.map(tabTag));
  cacheLife(tabs.every((t) => SLOW_TABS.has(t)) ? { stale: 300, revalidate: 300, expire: 900 } : { stale: 60, revalidate: 60, expire: 300 });
  return fetchTabsValues(sheetsValuesApi(), sheetId(), tabs);
}

/** Expire immediately so the writer (and everyone else) reads fresh data next request. */
export async function invalidateTab(tab: TabName): Promise<void> {
  revalidateTag(tabTag(tab), { expire: 0 });
}
