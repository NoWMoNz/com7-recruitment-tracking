import "server-only";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { sheetId, sheetsValuesApi } from "@/lib/sheets/client";
import type { TabName } from "@/lib/sheets/schema";
import { fetchTabValues } from "./sheets-repo";

export const tabTag = (tab: TabName) => `sheet:${tab}`;

/** Raw tab values, shared across requests for up to ~60 seconds. */
export async function readTabCached(tab: TabName): Promise<unknown[][]> {
  "use cache";
  cacheTag(tabTag(tab));
  cacheLife({ stale: 60, revalidate: 60, expire: 300 });
  return fetchTabValues(sheetsValuesApi(), sheetId(), tab);
}

/** Expire immediately so the writer (and everyone else) reads fresh data next request. */
export async function invalidateTab(tab: TabName): Promise<void> {
  revalidateTag(tabTag(tab), { expire: 0 });
}
