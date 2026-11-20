import type { Branch, ImportInitial, LocalDate, Position, QuotaLine } from "@/lib/domain/types";

/** One line of the "All" sheet in HR's "Quota Branch" report. A line with no position is the branch total. */
export interface QuotaRow {
  id: string;
  shop: string;
  /** "Group เล็ก", e.g. Studio7, BaNANA. */
  brand: string;
  /** "Group ใหญ่", the business unit: Apple, BaNANA, iCare… */
  bu: string;
  region: string;
  province: string;
  position: string;
  quota: number;
  actual: number;
  /** quota − actual: above zero = short, below zero = over. */
  vacant: number;
}

export interface QuotaImport {
  branches: Branch[];
  positions: Position[];
  /** One row per missing person, ready for the Import_Initial tab. */
  initial: ImportInitial[];
  warnings: string[];
  /** Quota / Actual of every position line that has a code, closed shops included (the page decides what to show). */
  quota: QuotaLine[];
  summary: { branches: number; positions: number; openings: number; shortRows: number; over: number; closedBranches: number; /** Missing people of closed shops, left out. */ closedOpenings: number };
}

const CLOSED_MARK = /\s*\(\s*ปิด\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})\s*\)\s*$/;

/** HR marks a closed shop by ending its name with "(ปิด25/10/69)": the date in the Buddhist era, year in 2 or 4 digits. */
export function closedDate(shop: string): LocalDate | null {
  const m = CLOSED_MARK.exec(shop.trim());
  if (!m) return null;
  const [d, mo] = [Number(m[1]), Number(m[2])];
  const be = m[3].length === 2 ? 2500 + Number(m[3]) : Number(m[3]);
  const y = be - 543;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "ID 103_Studio 7_Paradise Park_Srinakarin" -> "Studio 7 Paradise Park Srinakarin" (without a closing marker). */
export function branchName(shop: string): string {
  return shop
    .replace(CLOSED_MARK, "")
    .replace(/^ID\s*\d+\s*_?/i, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** Report date written in the file name, e.g. "Quota Branch 11 Nov 2026.xls" -> "2026-11-11". */
export function reportDateFromName(name: string): LocalDate | null {
  const m = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/.exec(name);
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  const day = Number(m[1]);
  if (!month || day < 1 || day > 31) return null;
  return `${m[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Turns the quota report into master data and opening vacancies:
 * every branch and position it mentions, and one Import_Initial row (status Vacancy) per person short.
 * Over-staffed positions and positions without a quota create nothing.
 */
export function convertQuota(rows: QuotaRow[], codeByName: ReadonlyMap<string, string>, requestDate: LocalDate): QuotaImport {
  const warnings: string[] = [];
  const branches = new Map<string, Branch>();
  const positions = new Map<string, Position>();
  const initial: ImportInitial[] = [];
  const quotaLines: QuotaLine[] = [];
  const missing = new Set<string>();
  let shortRows = 0;
  let over = 0;
  let closedOpenings = 0;
  const closedIds = new Set<string>();

  for (const r of rows) {
    const id = r.id.trim();
    if (!id) continue;
    const known = branches.get(id);
    if (!known) {
      branches.set(id, {
        branch_code: id,
        branch_name: branchName(r.shop) || r.shop.trim(),
        brand: r.brand.trim(),
        bu: r.bu.trim(),
        province: r.province.trim(),
        region: r.region.trim(),
        // A closed shop keeps its branch row (history, reports) but gets its date, and no vacancies below.
        status: closedDate(r.shop) ? "Closed" : "Open",
        open_date: null,
        close_date: closedDate(r.shop),
      });
      if (closedDate(r.shop)) closedIds.add(id);
    } else if (known.region !== r.region.trim() || known.province !== r.province.trim()) {
      warnings.push(`สาขา ${id} มีภาค/จังหวัดไม่ตรงกันในไฟล์ ใช้ค่าแรก (${known.region} · ${known.province})`);
    }

    const name = r.position.trim();
    if (!name) continue;
    const code = codeByName.get(name);
    if (!code) {
      missing.add(name);
      continue;
    }
    quotaLines.push({ branch_code: id, position_code: code, quota: Math.round(r.quota), actual: Math.round(r.actual), report_date: requestDate });
    if (!positions.has(code)) positions.set(code, { position_code: code, position_name: name, position_group: "", sla_days: null });

    const short = Math.round(r.vacant);
    if (short < 0) over += -short;
    if (short <= 0) continue;
    if (closedIds.has(id)) {
      closedOpenings += short;
      continue;
    }
    shortRows++;
    for (let i = 0; i < short; i++) {
      initial.push({
        branch_code: id,
        position_code: code,
        request_date: requestDate,
        ta_email: "",
        status: "Vacancy",
        title: "",
        first_name: "",
        last_name: "",
        offer_date: null,
        sourcing_channel: "",
        hold_since: null,
        processed_at: "",
      });
    }
  }

  for (const name of missing) warnings.push(`ไม่พบรหัสของตำแหน่ง "${name}" ในชีต Quota01_Summary จึงข้ามไป`);
  return {
    branches: [...branches.values()],
    positions: [...positions.values()],
    initial,
    quota: quotaLines,
    warnings,
    summary: { branches: branches.size, positions: positions.size, openings: initial.length, shortRows, over, closedBranches: closedIds.size, closedOpenings },
  };
}

/**
 * Position codes from the "Quota01_Summary" sheet, where a position line is the code indented under its branch,
 * with the position name in another column: ["    BSM", "    Branch Sales Manager"] -> BSM.
 */
export function codesFromSummary(lines: { code: string; name: string }[]): { codes: Map<string, string>; warnings: string[] } {
  const codes = new Map<string, string>();
  const warnings: string[] = [];
  for (const { code, name } of lines) {
    if (!/^\s+\S/.test(code)) continue; // branch lines and headers are not indented
    const c = code.trim();
    const n = name.trim();
    if (!n || c === "รหัสตำแหน่ง") continue;
    const seen = codes.get(n);
    if (seen && seen !== c) warnings.push(`ตำแหน่ง "${n}" มีหลายรหัส (${seen}, ${c}) ใช้ ${seen}`);
    else codes.set(n, c);
  }
  return { codes, warnings };
}
