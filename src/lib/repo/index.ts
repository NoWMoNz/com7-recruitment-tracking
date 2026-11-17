import "server-only";
import { sheetId, sheetsValuesApi } from "@/lib/sheets/client";
import { fixtures } from "./fixtures";
import { MemoryRepo } from "./memory-repo";
import { invalidateTab, readTabCached } from "./next-cache";
import { SheetsRepo } from "./sheets-repo";
import type { Repo } from "./types";

const globalForRepo = globalThis as unknown as { __repo?: Repo };

/** DATA_SOURCE=sheets uses Google Sheets; anything else uses the in-memory demo data. */
export function getRepo(): Repo {
  if (!globalForRepo.__repo) {
    globalForRepo.__repo =
      process.env.DATA_SOURCE === "sheets"
        ? new SheetsRepo({
            api: sheetsValuesApi(),
            sheetId: sheetId(),
            readCached: readTabCached,
            invalidate: invalidateTab,
          })
        : new MemoryRepo(fixtures);
  }
  return globalForRepo.__repo;
}

export * from "./types";
