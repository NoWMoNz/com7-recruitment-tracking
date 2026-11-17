export type ColType = "string" | "number" | "date" | "bool";

export interface ColSpec {
  key: string;
  type: ColType;
}

export type TabName =
  | "Branches"
  | "Positions"
  | "SourcingChannels"
  | "RecruiterAssignments"
  | "Users"
  | "Settings"
  | "Import_Initial"
  | "Import_Requisition"
  | "Import_Resign"
  | "Import_Transfer"
  | "Import_NewEmployee"
  | "Requisitions"
  | "Offers"
  | "NewHires"
  | "Turndowns"
  | "Approvals"
  | "StatusLog"
  | "ReviewQueue"
  | "MonthlySnapshots"
  | "Requisitions_Archive"
  | "StatusLog_Archive";

export interface TabSpec {
  name: TabName;
  columns: ColSpec[];
  /** System-managed tab: protected in the Sheet (warning only). */
  system: boolean;
}

/** Compact column list: "name" = string, "name:d" date, "name:n" number, "name:b" bool. */
function cols(...defs: string[]): ColSpec[] {
  const types: Record<string, ColType> = { d: "date", n: "number", b: "bool" };
  return defs.map((d) => {
    const [key, t] = d.split(":");
    return { key, type: t ? types[t] : "string" };
  });
}

const REQUISITION_COLS = cols(
  "id", "branch_code", "position_code", "request_date:d", "source", "source_ref", "ta_email", "status",
  "status_date:d", "offer_id", "closed_at:d", "version:n", "created_at", "updated_at",
);
const OFFER_COLS = cols(
  "id", "req_id", "title", "first_name", "last_name", "phone", "offer_date:d", "sourcing_channel",
  "tat_at_offer:n", "ta_email", "created_by", "created_at",
);
const STATUS_LOG_COLS = cols(
  "id", "req_id", "from_status", "to_status", "effective_date:d", "actor", "at", "note", "ref_id",
);

const defs: [TabName, boolean, ColSpec[]][] = [
  ["Branches", false, cols(
    "branch_code", "branch_name", "brand", "province", "region", "status", "open_date:d", "close_date:d",
  )],
  ["Positions", false, cols("position_code", "position_name", "position_group", "sla_days:n")],
  ["SourcingChannels", false, cols("channel", "active:b")],
  ["RecruiterAssignments", false, cols("branch_code", "position_group", "ta_email")],
  ["Users", false, cols("email", "name", "role", "scope", "active:b")],
  ["Settings", false, cols("key", "value")],
  ["Import_Initial", false, cols(
    "branch_code", "position_code", "request_date:d", "ta_email", "status", "title", "first_name", "last_name",
    "offer_date:d", "sourcing_channel", "hold_since:d", "processed_at",
  )],
  ["Import_Requisition", false, cols(
    "branch_code", "position_code", "headcount:n", "request_date:d", "source", "note", "processed_at",
  )],
  ["Import_Resign", false, cols(
    "employee_id", "title", "first_name", "last_name", "branch_code", "position_code", "effective_date:d",
    "processed_at",
  )],
  ["Import_Transfer", false, cols(
    "employee_id", "title", "first_name", "last_name", "from_branch", "from_position", "to_branch", "to_position",
    "effective_date:d", "processed_at",
  )],
  ["Import_NewEmployee", false, cols(
    "employee_id", "title", "first_name", "last_name", "branch_code", "position_code", "start_date:d",
    "processed_at", "matched_req_id",
  )],
  ["Requisitions", true, REQUISITION_COLS],
  ["Offers", true, OFFER_COLS],
  ["NewHires", true, [...OFFER_COLS, ...cols("employee_id", "start_date:d", "hired_at:d", "tat:n", "tat_result")]],
  ["Turndowns", true, [...OFFER_COLS, ...cols("turndown_date:d", "reason", "recorded_by")]],
  ["Approvals", true, cols(
    "id", "req_id", "type", "reason", "effective_date:d", "evidence_url", "requested_by", "requested_at",
    "status", "decided_by", "decided_at", "decision_note",
  )],
  ["StatusLog", true, STATUS_LOG_COLS],
  ["ReviewQueue", true, cols("id", "type", "ref", "detail", "resolved_by", "resolved_at")],
  ["MonthlySnapshots", true, cols(
    "month", "ta_email", "region", "carried_in:n", "new:n", "total:n", "closed:n", "cancel:n", "hold:n",
    "offer_pending:n", "remaining:n", "tat_meet:n", "tat_total:n", "computed_at",
  )],
  ["Requisitions_Archive", true, REQUISITION_COLS],
  ["StatusLog_Archive", true, STATUS_LOG_COLS],
];

export const TABS = Object.fromEntries(
  defs.map(([name, system, columns]) => [name, { name, system, columns }]),
) as Record<TabName, TabSpec>;
