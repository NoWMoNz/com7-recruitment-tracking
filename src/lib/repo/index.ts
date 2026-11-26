import "server-only";
import { sheetId, sheetsValuesApi } from "@/lib/sheets/client";
import { fixtures } from "./fixtures";
import { MemoryRepo } from "./memory-repo";
import { invalidateTab, readTabsCached } from "./next-cache";
import { SheetsRepo } from "./sheets-repo";
import type { Repo } from "./types";

const globalForRepo = globalThis as unknown as { __repo?: Repo };
const REPO_METHODS: (keyof Repo)[] = ["list", "getFresh", "append", "update", "updateMany", "listNumbered", "updateAt", "removeAt", "remove", "invalidate"];

/** DATA_SOURCE=sheets uses Google Sheets; anything else uses the in-memory demo data. */
export function getRepo(): Repo {
  // The instance is kept on globalThis so dev hot-reloads don't wipe the demo data. One made by an older copy
  // of the code (before a method was added) is replaced. Checked by shape, not instanceof: Server Actions and
  // page rendering load separate copies of this module, so instanceof would make them replace each other's repo.
  const current = globalForRepo.__repo as Partial<Repo> | undefined;
  if (!current || REPO_METHODS.some((m) => typeof current[m] !== "function")) {
    globalForRepo.__repo =
      process.env.DATA_SOURCE === "sheets"
        ? new SheetsRepo({
            api: sheetsValuesApi(),
            sheetId: sheetId(),
            readCachedMany: readTabsCached,
            invalidate: invalidateTab,
          })
        : new MemoryRepo(fixtures);
  }
  return globalForRepo.__repo!;
}

export * from "./types";
