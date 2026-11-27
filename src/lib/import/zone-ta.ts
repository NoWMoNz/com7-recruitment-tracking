import { withoutClosedMark } from "./quota";

/**
 * HR's shop database ("Zone TA" file): one line per shop with its AM, RM and TA.
 * Columns: ID | Name | จังหวัด | ภาค | BU | RM | AM | TA. Its Name ("ID1060 : BB-…") is not used: shops are named
 * as in the Name_ column of the Zone sheet in HR's quota file ("ID 1060_BB_Emquartier_Sukhumvit").
 */
export interface ZoneTaRow {
  id: string;
  am: string;
  rm: string;
  ta: string;
}

export interface ZoneShop {
  full_name: string;
  am: string;
  rm: string;
  ta: string;
}

/** A cell as the system keeps it: trimmed; "-" and spreadsheet errors such as "#N/A" mean nothing. */
export function zoneText(v: string): string {
  const t = v.trim();
  return t === "-" || t.startsWith("#") ? "" : t;
}

/** Full shop names by ID from the Zone sheet's Name_ column, without "(ปิด…)" (Branches keeps closing as a status and date). */
export function shopNamesFromZone(rows: { id: string; name: string }[]): Map<string, string> {
  const byId = new Map<string, string>();
  for (const r of rows) {
    const id = r.id.trim();
    const name = withoutClosedMark(zoneText(r.name));
    if (id && name && !byId.has(id)) byId.set(id, name);
  }
  return byId;
}

/**
 * Shops by ID: AM / RM / TA from the TA file, full names from `names`. A repeated ID keeps its first line,
 * filling only what that line left blank; a shop with only a name still gets it.
 */
export function shopsFromZoneTa(rows: ZoneTaRow[], names: ReadonlyMap<string, string> = new Map()): Map<string, ZoneShop> {
  const byId = new Map<string, ZoneShop>();
  for (const [id, full_name] of names) byId.set(id, { full_name, am: "", rm: "", ta: "" });
  for (const r of rows) {
    const id = r.id.trim();
    if (!id) continue;
    const next: ZoneShop = { full_name: names.get(id) ?? "", am: zoneText(r.am), rm: zoneText(r.rm), ta: zoneText(r.ta) };
    const seen = byId.get(id);
    if (!seen) byId.set(id, next);
    else for (const k of Object.keys(next) as (keyof ZoneShop)[]) if (!seen[k]) seen[k] = next[k];
  }
  return byId;
}

export interface ZoneApplyResult {
  /** The Branches tab with the database applied: header first, every other column and row as it was. */
  values: unknown[][];
  /** Columns that were not in the header yet and were added at its end. */
  addedColumns: string[];
  /** Branches whose full name, AM, RM or TA changed. */
  changed: number;
  /** Branch codes in the tab that the database does not list (left as they are). */
  notInZone: string[];
  /** Shop IDs in the database that the tab does not have (not added). */
  notInBranches: string[];
}

const FIELDS = ["full_name", "am", "rm", "ta"] as const;

/**
 * Applies the database to the Branches tab's raw values. Only shops already in the tab are touched; a blank
 * in the database never wipes what the tab has. Blank rows stay blank.
 */
export function applyZoneToBranches(values: unknown[][], shops: Map<string, ZoneShop>): ZoneApplyResult {
  const header = (values[0] ?? []).map((h) => String(h ?? "").trim());
  const codeCol = header.indexOf("branch_code");
  if (codeCol === -1) throw new Error("แท็บ Branches ไม่มีคอลัมน์ branch_code");
  const addedColumns = FIELDS.filter((f) => !header.includes(f));
  const outHeader = [...header, ...addedColumns];
  const col = Object.fromEntries(FIELDS.map((f) => [f, outHeader.indexOf(f)])) as Record<(typeof FIELDS)[number], number>;

  let changed = 0;
  const notInZone: string[] = [];
  const seen = new Set<string>();
  const rows = values.slice(1).map((raw) => {
    const row = [...(raw ?? [])];
    const code = String(row[codeCol] ?? "").trim();
    if (!code) return row;
    seen.add(code);
    const shop = shops.get(code);
    if (!shop) {
      notInZone.push(code);
      return row;
    }
    while (row.length < outHeader.length) row.push("");
    let touched = false;
    for (const f of FIELDS) {
      if (!shop[f] || String(row[col[f]] ?? "").trim() === shop[f]) continue;
      row[col[f]] = shop[f];
      touched = true;
    }
    if (touched) changed++;
    return row;
  });
  const notInBranches = [...shops.keys()].filter((id) => !seen.has(id));
  return { values: [outHeader, ...rows], addedColumns, changed, notInZone, notInBranches };
}
