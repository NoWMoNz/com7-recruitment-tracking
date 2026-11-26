import { offerEditableUntil } from "./offer";
import { matchesPeople, peopleOfBranch, type PeopleFilter } from "./people";
import { canEditRequisition, inScope, normalizeEmail } from "./permissions";
import { slaFor, type AppSettings } from "./settings";
import { agingBand, computeTat, holdDays, tatResult, type AgingBand, type TatResult } from "./tat";
import {
  ON_PROCESS,
  buOf,
  type Branch,
  type LocalDate,
  type Offer,
  type Position,
  type Requisition,
  type Status,
  type StatusLogEntry,
  type User,
} from "./types";

export interface TrackingData {
  requisitions: Requisition[];
  offers: Offer[];
  log: StatusLogEntry[];
  branches: Branch[];
  positions: Position[];
  users: User[];
  settings: AppSettings;
}

export interface TrackingRow {
  id: string;
  region: string;
  province: string;
  /** Business unit of the branch (Group ใหญ่). */
  bu: string;
  /** Area / Regional Manager of the branch; "" when not set. */
  am: string;
  rm: string;
  branchCode: string;
  branchName: string;
  positionName: string;
  requestDate: LocalDate;
  status: Status;
  upcoming: boolean;
  tat: number;
  tatResult: TatResult;
  agingBand: AgingBand | null;
  taEmail: string;
  taName: string;
  offerName: string | null;
  offerDate: LocalDate | null;
  offerChannel: string | null;
  /** The Offer as saved, for its edit form; the phone only for people who can edit the row. */
  offer: { title: string; firstName: string; lastName: string; phone: string; channel: string; startDate: LocalDate | null; editableUntil: string } | null;
  /** Offered, the planned start date has passed, and HR has not issued an employee ID yet. */
  startOverdue: boolean;
  /** Days on hold up to today (or the offer date); lets the Offer form preview TAT for another date. */
  holdDays: number;
  slaDays: number;
  canEdit: boolean;
  version: number;
}

const UNKNOWN_REGION = "ไม่ระบุ";

/** "Pending" = waiting for a Cancel or Hold decision. */
export type TrackingStatusFilter = "" | "Vacancy" | "Offer" | "Pending";

/** The tracking page's filters (all optional); the Excel export applies the same ones. */
export interface TrackingFilter extends PeopleFilter {
  bu?: string;
  region?: string;
  status?: TrackingStatusFilter;
  q?: string;
  band?: AgingBand;
  /** Request date (วันที่แจ้งสรรหา) range, both ends inclusive. */
  from?: LocalDate;
  to?: LocalDate;
}

function matchesText(r: TrackingRow, q: string): boolean {
  if (!q) return true;
  const hay = `${r.branchName} ${r.branchCode} ${r.positionName} ${r.taName} ${r.province} ${r.offerName ?? ""}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

const matchesStatus = (r: TrackingRow, s: TrackingStatusFilter | undefined) =>
  !s || (s === "Pending" ? r.status === "PendingCancel" || r.status === "PendingHold" : r.status === s);

export function filterTrackingRows(rows: TrackingRow[], f: TrackingFilter): TrackingRow[] {
  const q = f.q?.trim() ?? "";
  return rows.filter(
    (r) =>
      (!f.bu || r.bu === f.bu) &&
      (!f.region || r.region === f.region) &&
      matchesStatus(r, f.status) &&
      matchesText(r, q) &&
      matchesPeople(r, f) &&
      (!f.from || r.requestDate >= f.from) &&
      (!f.to || r.requestDate <= f.to) &&
      (!f.band || r.agingBand === f.band),
  );
}

export function buildTrackingRows(
  data: TrackingData,
  viewer: User,
  today: LocalDate,
  opts: { mineOnly: boolean },
): TrackingRow[] {
  const branches = new Map(data.branches.map((b) => [b.branch_code, b]));
  const positions = new Map(data.positions.map((p) => [p.position_code, p]));
  const offers = new Map(data.offers.map((o) => [o.id, o]));
  const users = new Map(data.users.map((u) => [normalizeEmail(u.email), u]));
  const me = normalizeEmail(viewer.email);

  const rows: TrackingRow[] = [];
  for (const r of data.requisitions) {
    if (!ON_PROCESS.includes(r.status)) continue;
    if (opts.mineOnly && normalizeEmail(r.ta_email) !== me) continue;

    const b = branches.get(r.branch_code);
    const scopeTarget = b ?? { region: UNKNOWN_REGION, branch_code: r.branch_code };
    if (!inScope(viewer, scopeTarget)) continue;

    const position = positions.get(r.position_code);
    const offer = r.status === "Offer" ? offers.get(r.offer_id) ?? null : null;
    const end = offer ? offer.offer_date : today;
    const held = holdDays(data.log, r.id, end);
    const tat = computeTat({ requestDate: r.request_date, endDate: end, holdDays: held });
    const sla = slaFor(position, data.settings);
    const canEdit = canEditRequisition(viewer, r);

    rows.push({
      id: r.id,
      region: b?.region || UNKNOWN_REGION,
      province: b?.province ?? "",
      bu: buOf(b),
      ...peopleOfBranch(b),
      branchCode: r.branch_code,
      branchName: b?.branch_name || r.branch_code,
      positionName: position?.position_name || r.position_code,
      requestDate: r.request_date,
      status: r.status,
      upcoming: r.request_date > today,
      tat,
      tatResult: tatResult(tat, offer !== null, sla),
      agingBand: offer ? null : agingBand(tat, data.settings.agingBands),
      taEmail: r.ta_email,
      taName: users.get(normalizeEmail(r.ta_email))?.name || r.ta_email,
      offerName: offer ? `${offer.title}${offer.first_name} ${offer.last_name}`.trim() : null,
      offerDate: offer?.offer_date ?? null,
      offerChannel: offer?.sourcing_channel ?? null,
      offer: offer
        ? {
            title: offer.title,
            firstName: offer.first_name,
            lastName: offer.last_name,
            phone: canEdit ? offer.phone : "",
            channel: offer.sourcing_channel,
            startDate: offer.planned_start_date ?? null,
            editableUntil: offerEditableUntil(offer),
          }
        : null,
      startOverdue: Boolean(offer?.planned_start_date && offer.planned_start_date < today),
      holdDays: held,
      slaDays: sla,
      canEdit,
      version: r.version,
    });
  }

  return rows.sort(
    (a, b) =>
      a.region.localeCompare(b.region, "th") ||
      a.branchName.localeCompare(b.branchName, "th") ||
      a.positionName.localeCompare(b.positionName, "th") ||
      a.requestDate.localeCompare(b.requestDate),
  );
}
