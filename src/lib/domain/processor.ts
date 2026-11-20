import { formatThaiDate } from "./dates";
import { TITLES } from "./offer";
import { slaFor, type AppSettings } from "./settings";
import { holdDays, computeTat } from "./tat";
import type {
  Approval,
  Branch,
  ImportInitial,
  ImportNewEmployee,
  ImportRequisition,
  ImportResign,
  ImportTransfer,
  LocalDate,
  NewHire,
  Offer,
  Position,
  Requisition,
  ReviewItem,
  ReviewType,
  Status,
  StatusLogEntry,
} from "./types";

/**
 * The Processor: turns what super_admin pasted into the Import_* tabs, plus store closures, into
 * requisition changes. Pure and idempotent: running it again on its own output changes nothing, because
 * every created row carries a stable `source_ref` / log `ref_id` / review `ref` that is checked first.
 */

export type ImportTab = "Import_Initial" | "Import_Requisition" | "Import_Resign" | "Import_Transfer" | "Import_NewEmployee";
export interface Numbered<T> {
  rowNumber: number;
  row: T;
}

export interface Assignment {
  branch_code: string;
  position_group: string;
  ta_email: string;
}

export interface ProcessorInput {
  today: LocalDate;
  now: Date;
  /** Email of the super_admin who pressed the button, or "system" for the nightly run. */
  actor: string;
  settings: AppSettings;
  requisitions: Requisition[];
  offers: Offer[];
  log: StatusLogEntry[];
  approvals: Approval[];
  branches: Branch[];
  positions: Position[];
  assignments: Assignment[];
  channels: string[];
  newHires: NewHire[];
  reviewQueue: ReviewItem[];
  imports: {
    initial: Numbered<ImportInitial>[];
    requisition: Numbered<ImportRequisition>[];
    resign: Numbered<ImportResign>[];
    transfer: Numbered<ImportTransfer>[];
    newEmployee: Numbered<ImportNewEmployee>[];
  };
  newId: (prefix: string) => string;
}

export interface Skipped {
  tab: ImportTab;
  rowNumber: number;
  reason: string;
}

export interface ProcessorSummary {
  created: number;
  transferred: number;
  cancelled: number;
  hired: number;
  review: number;
  /** Transfers whose effective date hasn't come yet (checked again on later runs). */
  waiting: number;
  skipped: Skipped[];
}

export interface ProcessorPlan {
  reqAppend: Requisition[];
  reqUpdate: { id: string; patch: Partial<Requisition>; expectedVersion: number }[];
  offerAppend: Offer[];
  offerRemove: string[];
  newHireAppend: NewHire[];
  approvalUpdate: { id: string; patch: Partial<Approval> }[];
  logAppend: StatusLogEntry[];
  reviewAppend: ReviewItem[];
  importMarks: Record<ImportTab, { rowNumber: number; patch: Record<string, string> }[]>;
  summary: ProcessorSummary;
}

const OPEN: Status[] = ["Vacancy", "PendingCancel", "PendingHold", "Hold"];
const REQUISITION_SOURCES = ["NewStore", "Project", "Additional"];
const TITLE_PREFIX = /^(นางสาว|น\.ส\.|นาง|นาย|ด\.ช\.|ด\.ญ\.|mrs\.?|mr\.?|ms\.?|miss)\s*/i;

/** "นายสมชาย  ใจดี" / "สมชาย ใจดี" -> "สมชาย ใจดี": the key used to match a new employee to an Offer. */
export function personKey(first: string, last: string): string {
  return `${first.trim().replace(TITLE_PREFIX, "")} ${last.trim()}`.replace(/\s+/g, " ").trim().toLowerCase();
}

/** TA for a new requisition: branch + position group beats branch-only; "" when nobody is assigned. */
export function assignTa(branchCode: string, positionGroup: string, assignments: Assignment[]): string {
  const forBranch = assignments.filter((a) => a.branch_code === branchCode);
  const exact = forBranch.find((a) => a.position_group && a.position_group === positionGroup);
  return (exact ?? forBranch.find((a) => !a.position_group))?.ta_email ?? "";
}

export function planProcessing(input: ProcessorInput): ProcessorPlan {
  const { today, now, actor, settings, newId } = input;
  const at = now.toISOString();
  const branches = new Map(input.branches.map((b) => [b.branch_code, b]));
  const positions = new Map(input.positions.map((p) => [p.position_code, p]));

  // Working copy of requisitions: later steps see what earlier steps did in this run.
  const reqs = new Map(input.requisitions.map((r) => [r.id, { ...r }]));
  const original = new Map(input.requisitions.map((r) => [r.id, r]));
  const patches = new Map<string, Partial<Requisition>>();
  const created: Requisition[] = [];
  const sourceRefs = new Set(input.requisitions.map((r) => r.source_ref).filter(Boolean));
  const logRefs = new Set(input.log.map((e) => `${e.to_status}|${e.ref_id}`));
  const reviewRefs = new Set(input.reviewQueue.map((r) => r.ref));
  const hiredEmployees = new Set(input.newHires.map((h) => h.employee_id).filter(Boolean));
  const offers = new Map(input.offers.map((o) => [o.id, o]));

  const plan: ProcessorPlan = {
    reqAppend: created,
    reqUpdate: [],
    offerAppend: [],
    offerRemove: [],
    newHireAppend: [],
    approvalUpdate: [],
    logAppend: [],
    reviewAppend: [],
    importMarks: { Import_Initial: [], Import_Requisition: [], Import_Resign: [], Import_Transfer: [], Import_NewEmployee: [] },
    summary: { created: 0, transferred: 0, cancelled: 0, hired: 0, review: 0, waiting: 0, skipped: [] },
  };
  const s = plan.summary;

  const skip = (tab: ImportTab, rowNumber: number, reason: string) => s.skipped.push({ tab, rowNumber, reason });
  const mark = (tab: ImportTab, rowNumber: number, extra: Record<string, string> = {}) =>
    plan.importMarks[tab].push({ rowNumber, patch: { processed_at: at, ...extra } });
  const addLog = (e: Omit<StatusLogEntry, "id" | "actor" | "at">) => {
    plan.logAppend.push({ id: newId("LOG"), actor, at, ...e });
    logRefs.add(`${e.to_status}|${e.ref_id}`);
  };
  const review = (type: ReviewType, ref: string, detail: string) => {
    if (reviewRefs.has(ref)) return;
    reviewRefs.add(ref);
    plan.reviewAppend.push({ id: newId("REV"), type, ref, detail, resolved_by: "", resolved_at: "" });
    s.review++;
  };
  const patchReq = (id: string, patch: Partial<Requisition>) => {
    Object.assign(reqs.get(id)!, patch);
    if (original.has(id)) patches.set(id, { ...patches.get(id), ...patch });
    // New rows are appended with their final state, so no separate patch is needed for them.
  };
  const createReq = (p: { branch: string; position: string; requestDate: LocalDate; source: string; sourceRef: string; ta?: string }): Requisition => {
    const r: Requisition = {
      id: newId("REQ"),
      branch_code: p.branch,
      position_code: p.position,
      request_date: p.requestDate,
      source: p.source,
      source_ref: p.sourceRef,
      ta_email: p.ta ?? assignTa(p.branch, positions.get(p.position)?.position_group ?? "", input.assignments),
      status: "Vacancy",
      status_date: p.requestDate,
      offer_id: "",
      closed_at: null,
      version: 1,
      created_at: at,
      updated_at: at,
    };
    created.push(r);
    reqs.set(r.id, r);
    sourceRefs.add(p.sourceRef);
    addLog({ req_id: r.id, from_status: "", to_status: "Vacancy", effective_date: p.requestDate, note: `สร้างจาก ${p.source}`, ref_id: p.sourceRef });
    s.created++;
    return r;
  };
  const where = (branch: string, position: string) => `${positions.get(position)?.position_name ?? position} · ${branches.get(branch)?.branch_name ?? branch}`;
  /** Common row checks; returns an error message or null. */
  const checkPlace = (branch: string, position: string) =>
    !branches.has(branch) ? `ไม่พบรหัสสาขา "${branch}"` : !positions.has(position) ? `ไม่พบรหัสตำแหน่ง "${position}"` : null;
  const pending = <T extends { processed_at: string }>(rows: Numbered<T>[]) => rows.filter((r) => !String(r.row.processed_at ?? "").trim());

  // 1. Go-live import: positions already open on day one, with their real dates.
  for (const { rowNumber, row } of pending(input.imports.initial)) {
    const status = row.status.trim() || "Vacancy";
    const err =
      checkPlace(row.branch_code, row.position_code) ??
      (!row.request_date ? "ไม่มีวันที่แจ้งสรรหา" : null) ??
      (!["Vacancy", "Offer", "Hold"].includes(status) ? `สถานะ "${status}" ใช้ได้เฉพาะ Vacancy / Offer / Hold` : null) ??
      (status === "Offer" && (!row.first_name.trim() || !row.last_name.trim() || !row.offer_date) ? "สถานะ Offer ต้องมีชื่อ นามสกุล และวันที่ Offer" : null) ??
      (status === "Hold" && !row.hold_since ? "สถานะ Hold ต้องมีวันที่เริ่มพัก" : null);
    if (err) {
      skip("Import_Initial", rowNumber, err);
      continue;
    }
    const ref = `INIT:r${rowNumber}:${row.branch_code}:${row.position_code}:${row.request_date}`;
    if (!sourceRefs.has(ref)) {
      const r = createReq({ branch: row.branch_code, position: row.position_code, requestDate: row.request_date!, source: "Initial", sourceRef: ref, ta: row.ta_email.trim() || undefined });
      if (status === "Offer") {
        const offer: Offer = {
          id: newId("OFF"),
          req_id: r.id,
          title: (TITLES as readonly string[]).includes(row.title.trim()) ? row.title.trim() : "",
          first_name: row.first_name.trim(),
          last_name: row.last_name.trim(),
          phone: "",
          offer_date: row.offer_date!,
          sourcing_channel: row.sourcing_channel.trim(),
          tat_at_offer: computeTat({ requestDate: r.request_date, endDate: row.offer_date!, holdDays: 0 }),
          ta_email: r.ta_email,
          created_by: actor,
          created_at: at,
        };
        plan.offerAppend.push(offer);
        offers.set(offer.id, offer);
        Object.assign(r, { status: "Offer", status_date: row.offer_date, offer_id: offer.id });
        addLog({ req_id: r.id, from_status: "Vacancy", to_status: "Offer", effective_date: row.offer_date!, note: "ข้อมูลตั้งต้น", ref_id: offer.id });
      } else if (status === "Hold") {
        Object.assign(r, { status: "Hold", status_date: row.hold_since });
        addLog({ req_id: r.id, from_status: "Vacancy", to_status: "Hold", effective_date: row.hold_since!, note: "ข้อมูลตั้งต้น", ref_id: ref });
      }
    }
    mark("Import_Initial", rowNumber);
  }

  // 2. New stores / projects / extra headcount.
  for (const { rowNumber, row } of pending(input.imports.requisition)) {
    const headcount = row.headcount ?? 1;
    const source = row.source.trim() || "Additional";
    const err =
      checkPlace(row.branch_code, row.position_code) ??
      (!Number.isInteger(headcount) || headcount < 1 || headcount > 50 ? "จำนวนอัตราต้องเป็นจำนวนเต็ม 1–50" : null) ??
      (!REQUISITION_SOURCES.includes(source) ? `ที่มา "${source}" ใช้ได้เฉพาะ ${REQUISITION_SOURCES.join(" / ")}` : null);
    if (err) {
      skip("Import_Requisition", rowNumber, err);
      continue;
    }
    const requestDate = row.request_date ?? today;
    for (let i = 1; i <= headcount; i++) {
      const ref = `IMPREQ:r${rowNumber}:${row.branch_code}:${row.position_code}:${requestDate}:${i}`;
      if (!sourceRefs.has(ref)) createReq({ branch: row.branch_code, position: row.position_code, requestDate, source, sourceRef: ref });
    }
    mark("Import_Requisition", rowNumber);
  }

  // 3. Resignations: a new requisition dated the effective date (shown as "upcoming" until then).
  for (const { rowNumber, row } of pending(input.imports.resign)) {
    const err = checkPlace(row.branch_code, row.position_code) ?? (!row.effective_date ? "ไม่มีวันที่มีผลลาออก" : null) ?? (!row.employee_id.trim() ? "ไม่มีรหัสพนักงาน" : null);
    if (err) {
      skip("Import_Resign", rowNumber, err);
      continue;
    }
    const ref = `RESIGN:${row.employee_id.trim()}:${row.effective_date}`;
    if (!sourceRefs.has(ref)) createReq({ branch: row.branch_code, position: row.position_code, requestDate: row.effective_date!, source: "Resign", sourceRef: ref });
    mark("Import_Resign", rowNumber);
  }

  // 4. Transfers: the source opens a vacancy (if enabled); on the effective date the destination's oldest
  //    Vacancy of that position is closed as Transfer.
  for (const { rowNumber, row } of pending(input.imports.transfer)) {
    const err =
      checkPlace(row.from_branch, row.from_position) ??
      checkPlace(row.to_branch, row.to_position) ??
      (!row.effective_date ? "ไม่มีวันที่มีผลโอนย้าย" : null) ??
      (!row.employee_id.trim() ? "ไม่มีรหัสพนักงาน" : null);
    if (err) {
      skip("Import_Transfer", rowNumber, err);
      continue;
    }
    const key = `${row.employee_id.trim()}:${row.effective_date}`;
    const outRef = `TROUT:${key}`;
    if (settings.transferOutCreatesVacancy && !sourceRefs.has(outRef)) {
      createReq({ branch: row.from_branch, position: row.from_position, requestDate: row.effective_date!, source: "TransferOut", sourceRef: outRef });
    }
    if (row.effective_date! > today) {
      s.waiting++;
      continue;
    }
    const inRef = `TRIN:${key}`;
    if (!logRefs.has(`Transfer|${inRef}`) && !reviewRefs.has(inRef)) {
      const target = [...reqs.values()]
        .filter((r) => r.status === "Vacancy" && r.branch_code === row.to_branch && r.position_code === row.to_position && r.request_date <= row.effective_date!)
        .sort((a, b) => a.request_date.localeCompare(b.request_date) || a.id.localeCompare(b.id))[0];
      if (target) {
        patchReq(target.id, { status: "Transfer", status_date: row.effective_date, closed_at: row.effective_date });
        addLog({ req_id: target.id, from_status: "Vacancy", to_status: "Transfer", effective_date: row.effective_date!, note: `รับโอน ${row.first_name} ${row.last_name}`.trim(), ref_id: inRef });
        s.transferred++;
      } else {
        review("TransferNoReq", inRef, `${row.first_name} ${row.last_name} (${row.employee_id}) โอนเข้า ${where(row.to_branch, row.to_position)} วันที่ ${formatThaiDate(row.effective_date)} แต่ไม่มีตำแหน่งว่างให้ปิด`);
      }
    }
    mark("Import_Transfer", rowNumber);
  }

  // 5. Store closures: on close_date, every open requisition of the store is cancelled. Offers can't be
  //    cancelled automatically (someone was promised a job), so they go to review.
  for (const b of input.branches) {
    if (!b.close_date || b.close_date > today) continue;
    for (const r of reqs.values()) {
      if (r.branch_code !== b.branch_code) continue;
      if (OPEN.includes(r.status)) {
        const from = r.status;
        patchReq(r.id, { status: "Cancel", status_date: b.close_date, closed_at: b.close_date });
        addLog({ req_id: r.id, from_status: from, to_status: "Cancel", effective_date: b.close_date, note: "ร้านปิด", ref_id: `CLOSE:${b.branch_code}` });
        s.cancelled++;
        for (const a of input.approvals) {
          if (a.req_id === r.id && a.status === "Pending") {
            plan.approvalUpdate.push({ id: a.id, patch: { status: "Rejected", decided_by: actor, decided_at: at, decision_note: "ปิดอัตโนมัติ: ร้านปิด" } });
          }
        }
      } else if (r.status === "Offer") {
        const o = offers.get(r.offer_id);
        review("OfferAtClosedStore", `CLOSE:${b.branch_code}:${r.id}`, `${where(r.branch_code, r.position_code)} ร้านปิด ${formatThaiDate(b.close_date)} แต่มีคน Offer ค้างอยู่${o ? ` (${o.title}${o.first_name} ${o.last_name})` : ""}`);
      }
    }
  }

  // 6. New employees: match each to exactly one open Offer by name + branch + position.
  for (const { rowNumber, row } of pending(input.imports.newEmployee)) {
    const err = checkPlace(row.branch_code, row.position_code) ?? (!row.employee_id.trim() ? "ไม่มีรหัสพนักงาน" : null) ?? (!row.first_name.trim() || !row.last_name.trim() ? "ไม่มีชื่อหรือนามสกุล" : null);
    if (err) {
      skip("Import_NewEmployee", rowNumber, err);
      continue;
    }
    if (hiredEmployees.has(row.employee_id.trim())) {
      mark("Import_NewEmployee", rowNumber);
      continue;
    }
    const key = personKey(row.first_name, row.last_name);
    const candidates = [...offers.values()].filter((o) => {
      const r = reqs.get(o.req_id);
      return r?.status === "Offer" && r.offer_id === o.id && r.branch_code === row.branch_code && r.position_code === row.position_code && personKey(o.first_name, o.last_name) === key;
    });
    if (candidates.length === 1) {
      const hire = hireFromOffer({ offer: candidates[0], req: reqs.get(candidates[0].req_id)!, employee: row, today, settings, log: input.log, positions });
      applyHire(hire);
      mark("Import_NewEmployee", rowNumber, { matched_req_id: hire.reqId });
    } else {
      const why = candidates.length === 0 ? "ไม่พบคน Offer ที่ชื่อ สาขา และตำแหน่งตรงกัน" : `พบคน Offer ที่ตรงกัน ${candidates.length} รายการ`;
      review("UnmatchedHire", newEmployeeRef(rowNumber, row.employee_id), `${row.title}${row.first_name} ${row.last_name} (${row.employee_id}) ${where(row.branch_code, row.position_code)}: ${why}`);
    }
  }

  function applyHire(hire: HirePlan) {
    patchReq(hire.reqId, hire.reqPatch);
    plan.newHireAppend.push(hire.newHire);
    plan.offerRemove.push(hire.newHire.id);
    offers.delete(hire.newHire.id);
    hiredEmployees.add(hire.newHire.employee_id);
    addLog({ req_id: hire.reqId, from_status: "Offer", to_status: "Hired", effective_date: today, note: `รหัสพนักงาน ${hire.newHire.employee_id}`, ref_id: hire.newHire.id });
    s.hired++;
  }

  for (const [id, patch] of patches) plan.reqUpdate.push({ id, patch, expectedVersion: original.get(id)!.version });
  return plan;
}

export const newEmployeeRef = (rowNumber: number, employeeId: string) => `NEW:r${rowNumber}:${employeeId.trim()}`;

interface HirePlan {
  reqId: string;
  reqPatch: Partial<Requisition>;
  newHire: NewHire;
}

/** Offer -> Hired for one matched person. Shared by the processor and super_admin's manual match. */
export function hireFromOffer(p: {
  offer: Offer;
  req: Requisition;
  employee: Pick<ImportNewEmployee, "employee_id" | "start_date">;
  today: LocalDate;
  settings: AppSettings;
  log: StatusLogEntry[];
  positions: Map<string, Position>;
}): HirePlan {
  const tat = computeTat({ requestDate: p.req.request_date, endDate: p.offer.offer_date, holdDays: holdDays(p.log, p.req.id, p.offer.offer_date) });
  const sla = slaFor(p.positions.get(p.req.position_code), p.settings);
  return {
    reqId: p.req.id,
    reqPatch: { status: "Hired", status_date: p.today, closed_at: p.today },
    newHire: { ...p.offer, employee_id: p.employee.employee_id.trim(), start_date: p.employee.start_date, hired_at: p.today, tat, tat_result: tat <= sla ? "Meet" : "NotMeet" },
  };
}
