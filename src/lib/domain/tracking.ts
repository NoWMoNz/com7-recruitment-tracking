import { canEditRequisition, inScope, normalizeEmail } from "./permissions";
import { slaFor, type AppSettings } from "./settings";
import { agingBand, computeTat, holdDays, tatResult, type AgingBand, type TatResult } from "./tat";
import {
  ON_PROCESS,
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
  /** Days on hold up to today (or the offer date); lets the Offer form preview TAT for another date. */
  holdDays: number;
  slaDays: number;
  canEdit: boolean;
  version: number;
}

const UNKNOWN_REGION = "ไม่ระบุ";

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

    rows.push({
      id: r.id,
      region: b?.region || UNKNOWN_REGION,
      province: b?.province ?? "",
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
      holdDays: held,
      slaDays: sla,
      canEdit: canEditRequisition(viewer, r),
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
