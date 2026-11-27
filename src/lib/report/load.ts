import "server-only";
import { formatThaiDate, parseUserDate, todayBangkok } from "@/lib/domain/dates";
import { branchLabel, peopleOfBranch, peopleOptions, taOf } from "@/lib/domain/people";
import { inScope, normalizeEmail } from "@/lib/domain/permissions";
import {
  byTa,
  filtered,
  fromSnapshot,
  groupHires,
  hiresBetween,
  monthOf,
  monthRange,
  monthlyRows,
  periodRange,
  sumRows,
  turndownsBetween,
  wholeMonth,
  type GroupStat,
  type HireRow,
  type MonthlyRow,
  type PeriodRange,
  type ReportFilter,
  type TurndownRow,
} from "@/lib/domain/report";
import { parseSettings } from "@/lib/domain/settings";
import { buOf, type LocalDate, type User } from "@/lib/domain/types";
import { getRepo } from "@/lib/repo";

export const REPORT_TABS = ["monthly", "weekly", "turndowns", "history"] as const;
export type ReportTab = (typeof REPORT_TABS)[number];

export interface ReportParams extends ReportFilter {
  tab: ReportTab;
  /** The days the Monthly, Hired and Turndown reports cover: the current month until another range (or everything) is picked. */
  range: PeriodRange;
}

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

/**
 * URL search params -> validated report params (bad values fall back to defaults).
 * `from`/`to` pick a range, `all=1` everything; `month` (an older link) means that whole month.
 */
export function parseReportParams(sp: Raw, today: LocalDate = todayBangkok()): ReportParams {
  const tab = REPORT_TABS.includes(one(sp.tab) as ReportTab) ? (one(sp.tab) as ReportTab) : "monthly";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(one(sp.month) ?? "") ? one(sp.month)! : monthOf(today);
  const range = periodRange(
    { from: parseUserDate(one(sp.from) ?? "") ?? undefined, to: parseUserDate(one(sp.to) ?? "") ?? undefined, all: one(sp.all) === "1" },
    monthRange(month),
  );
  return { tab, range, bu: one(sp.bu), region: one(sp.region), province: one(sp.province), branch: one(sp.branch), position: one(sp.position), ta: one(sp.ta), am: one(sp.am), rm: one(sp.rm) };
}

export interface FilterOptions {
  bus: string[];
  regions: string[];
  provinces: { value: string; region: string }[];
  branches: { value: string; label: string; bu: string; region: string; province: string }[];
  positions: { value: string; label: string }[];
  tas: { value: string; label: string }[];
  ams: string[];
  rms: string[];
}

export interface HistoryItem {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  entries: { date: LocalDate; from: string; to: string; actor: string; note: string }[];
}

export interface ReportResult {
  params: ReportParams;
  options: FilterOptions;
  monthly: {
    rows: MonthlyRow[];
    total: MonthlyRow;
    source: { kind: "snapshot"; computedAt: string } | { kind: "live" };
    canRecompute: boolean;
    /** Set when the range is one whole month. */
    month: string | null;
  };
  weekly: { hires: HireRow[]; groups: Record<"taName" | "am" | "rm" | "region" | "positionName" | "channel", GroupStat[]> };
  turndowns: { rows: TurndownRow[] };
  history: { items: HistoryItem[]; truncated: boolean };
}

const HISTORY_LIMIT = 60;

export async function loadReport(viewer: User, params: ReportParams): Promise<ReportResult> {
  const repo = getRepo();
  const [requisitions, log, branches, positions, users, settingRows, offers, turndowns, newHires, snapshots] = await Promise.all([
    repo.list("Requisitions"),
    repo.list("StatusLog"),
    repo.list("Branches"),
    repo.list("Positions"),
    repo.list("Users"),
    repo.list("Settings"),
    repo.list("Offers"),
    repo.list("Turndowns"),
    repo.list("NewHires"),
    repo.list("MonthlySnapshots"),
  ]);
  const today = todayBangkok();
  const data = { requisitions, log, branches, positions, users, settings: parseSettings(settingRows) };
  const reqs = filtered(data, viewer, params);
  const userName = new Map(users.map((u) => [normalizeEmail(u.email), u.name]));
  const nameOf = (email: string) => (email ? userName.get(normalizeEmail(email)) || email : "ยังไม่มีเจ้าของ");
  const branchBy = new Map(branches.map((b) => [b.branch_code, b]));
  const positionBy = new Map(positions.map((p) => [p.position_code, p]));

  // Filter choices, limited to what the viewer may see.
  const visibleBranches = branches.filter((b) => inScope(viewer, b));
  // TA choices: each shop's TA from HR's database, and the owners of requisitions at shops that have none.
  const userNameOf = (e: string) => userName.get(e);
  const managers = peopleOptions([
    ...visibleBranches.map((b) => ({ ...peopleOfBranch(b), ...taOf(b, "", userNameOf) })),
    ...requisitions
      .filter((r) => branchBy.get(r.branch_code) && inScope(viewer, branchBy.get(r.branch_code)!))
      .map((r) => ({ am: "", rm: "", ...taOf(branchBy.get(r.branch_code), r.ta_email, userNameOf, r.ta_name) })),
  ]);
  const options: FilterOptions = {
    bus: [...new Set(visibleBranches.map(buOf))].sort((a, b) => a.localeCompare(b, "th")),
    regions: [...new Set(visibleBranches.map((b) => b.region || "ไม่ระบุ"))].sort((a, b) => a.localeCompare(b, "th")),
    provinces: [...new Map(visibleBranches.filter((b) => b.province).map((b) => [b.province, { value: b.province, region: b.region }])).values()].sort((a, b) => a.value.localeCompare(b.value, "th")),
    branches: visibleBranches.map((b) => ({ value: b.branch_code, label: branchLabel(b.branch_code, b), bu: buOf(b), region: b.region, province: b.province })).sort((a, b) => a.label.localeCompare(b.label, "th")),
    positions: positions.map((p) => ({ value: p.position_code, label: p.position_name })).sort((a, b) => a.label.localeCompare(b.label, "th")),
    tas: managers.tas,
    ams: managers.ams,
    rms: managers.rms,
  };

  // Monthly: closed months come from the snapshot when the filter is one a snapshot can answer.
  const regionNames = new Set(branches.map((b) => b.region));
  const scopeTokens = viewer.scope.split(",").map((t) => t.trim()).filter(Boolean);
  // Snapshots are per TA × region only, so an AM / RM filter (like BU or branch) is always computed live.
  const snapshotFits = !params.bu && !params.province && !params.branch && !params.position && !params.am && !params.rm && scopeTokens.every((t) => regionNames.has(t));
  // A snapshot answers only a whole month that is already over.
  const month = wholeMonth(params.range);
  const closed = month !== null && month < monthOf(today);
  const snap = closed && snapshotFits
    ? fromSnapshot(snapshots, month, nameOf, (s) =>
        (!params.region || s.region === params.region) &&
        (!params.ta || normalizeEmail(s.ta_email) === normalizeEmail(params.ta)) &&
        (scopeTokens.length === 0 || scopeTokens.includes(s.region)))
    : null;
  const monthlyRaw = snap ? snap.rows : monthlyRows({ ...data, offers: [...newHires, ...turndowns, ...offers] }, reqs, params.range, today);
  const monthlyByTa = byTa(monthlyRaw);

  const { first, last } = params.range;
  const hires = hiresBetween({ ...data, newHires }, reqs, first, last);

  // History: every status change of the filtered requisitions, newest activity first.
  const logBy = new Map<string, typeof log>();
  for (const e of log) logBy.set(e.req_id, [...(logBy.get(e.req_id) ?? []), e]);
  const lastActivity = (id: string) => (logBy.get(id) ?? []).map((e) => e.at).sort().at(-1) ?? "";
  const ordered = [...reqs].sort((a, b) => lastActivity(b.id).localeCompare(lastActivity(a.id)) || b.request_date.localeCompare(a.request_date));
  const history: HistoryItem[] = ordered.slice(0, HISTORY_LIMIT).map((r) => ({
    id: r.id,
    title: `${positionBy.get(r.position_code)?.position_name ?? r.position_code} · ${branchLabel(r.branch_code, branchBy.get(r.branch_code))}`,
    subtitle: `${r.id} · แจ้งสรรหา ${formatThaiDate(r.request_date)} · TA ${taOf(branchBy.get(r.branch_code), r.ta_email, userNameOf, r.ta_name).taName || "ยังไม่มีเจ้าของ"} · ที่มา ${r.source || "-"}`,
    status: r.status,
    entries: (logBy.get(r.id) ?? [])
      .slice()
      .sort((a, b) => a.effective_date.localeCompare(b.effective_date) || a.at.localeCompare(b.at))
      .map((e) => ({ date: e.effective_date, from: e.from_status, to: e.to_status, actor: e.actor === "system" ? "ระบบ" : nameOf(e.actor), note: e.note })),
  }));

  return {
    params,
    options,
    monthly: {
      rows: monthlyByTa,
      total: sumRows(monthlyRaw),
      source: snap ? { kind: "snapshot", computedAt: snap.computedAt } : { kind: "live" },
      canRecompute: viewer.role === "super_admin" && closed,
      month,
    },
    weekly: {
      hires,
      groups: { taName: groupHires(hires, "taName"), am: groupHires(hires, "am"), rm: groupHires(hires, "rm"), region: groupHires(hires, "region"), positionName: groupHires(hires, "positionName"), channel: groupHires(hires, "channel") },
    },
    turndowns: { rows: turndownsBetween({ ...data, turndowns }, reqs, first, last) },
    history: { items: history, truncated: ordered.length > HISTORY_LIMIT },
  };
}
