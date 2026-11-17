import type { sheets_v4 } from "googleapis";
import { TABS, type TabName } from "./schema";

export interface ExistingTab {
  title: string;
  sheetId: number;
  /** True when the tab already has at least one protected range. */
  protected?: boolean;
}

const NEW_ID_BASE = 100_000;

/**
 * One batchUpdate that creates missing tabs (with pre-assigned sheetIds), freezes headers,
 * formats date columns and adds warning-only protection to system tabs. Safe to re-run.
 */
export function buildSetupRequests(existing: ExistingTab[]): sheets_v4.Schema$Request[] {
  const byTitle = new Map(existing.map((t) => [t.title, t]));
  const usedIds = new Set(existing.map((t) => t.sheetId));
  let nextId = NEW_ID_BASE;
  const freshId = () => {
    while (usedIds.has(nextId)) nextId++;
    usedIds.add(nextId);
    return nextId;
  };

  const requests: sheets_v4.Schema$Request[] = [];
  const formatting: sheets_v4.Schema$Request[] = [];

  for (const name of Object.keys(TABS) as TabName[]) {
    const spec = TABS[name];
    const found = byTitle.get(name);
    const sheetId = found ? found.sheetId : freshId();
    if (!found) {
      requests.push({ addSheet: { properties: { title: name, sheetId } } });
    }

    formatting.push({
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: "gridProperties.frozenRowCount",
      },
    });
    formatting.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true } } },
        fields: "userEnteredFormat.textFormat.bold",
      },
    });

    spec.columns.forEach((col, i) => {
      if (col.type !== "date") return;
      formatting.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 1, startColumnIndex: i, endColumnIndex: i + 1 },
          cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "dd/mm/yyyy" } } },
          fields: "userEnteredFormat.numberFormat",
        },
      });
    });

    if (spec.system && !found?.protected) {
      formatting.push({
        addProtectedRange: {
          protectedRange: {
            range: { sheetId },
            description: "ข้อมูลที่ระบบดูแล — ไม่ควรแก้ไขโดยตรง",
            warningOnly: true,
          },
        },
      });
    }
  }

  return [...requests, ...formatting];
}
