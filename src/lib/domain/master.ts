import { formatThaiDate, parseUserDate } from "./dates";
import type { Plan } from "./offer";
import { normalizeEmail } from "./permissions";
import { assignTa, type Assignment } from "./processor";
import type { Branch, LocalDate, Position, Requisition, Role, StatusLogEntry, User } from "./types";

/**
 * Master data maintained by super_admin in the web (the Sheet tabs can still be edited directly).
 * These tabs have no id column, so each row is identified by its natural key.
 */
export type MasterEntity = "Branches" | "Positions" | "SourcingChannels" | "RecruiterAssignments" | "Users";
export type FormInput = Record<string, string>;

export const BRANCH_STATUSES = ["Open", "Closed", "Project"] as const;
export const ROLES: Role[] = ["super_admin", "ta", "viewer"];
export const REQUISITION_SOURCES = ["NewStore", "Project", "Additional"] as const;

export function keyOf(entity: MasterEntity, row: Record<string, unknown>): string {
  switch (entity) {
    case "Branches":
      return String(row.branch_code ?? "").trim().toUpperCase();
    case "Positions":
      return String(row.position_code ?? "").trim().toUpperCase();
    case "SourcingChannels":
      return String(row.channel ?? "").trim().toLowerCase();
    case "RecruiterAssignments":
      return `${String(row.branch_code ?? "").trim().toUpperCase()}|${String(row.position_group ?? "").trim().toLowerCase()}`;
    case "Users":
      return normalizeEmail(String(row.email ?? ""));
  }
}

export interface MasterContext {
  /** Keys of the rows already in the tab. */
  existingKeys: Set<string>;
  /** Key of the row being edited, or null when adding. */
  originalKey: string | null;
  branches: Branch[];
  positions: Position[];
  users: User[];
  viewer: User;
}

const text = (v: string | undefined) => (v ?? "").trim();
const isOn = (v: string | undefined) => ["1", "true", "on", "yes"].includes(text(v).toLowerCase());

function optionalDate(raw: string | undefined, errors: Record<string, string>, key: string): LocalDate | null {
  if (!text(raw)) return null;
  const d = parseUserDate(text(raw));
  if (!d) errors[key] = "วันที่ไม่ถูกต้อง";
  return d;
}

function unique(entity: MasterEntity, row: Record<string, unknown>, ctx: MasterContext, errors: Record<string, string>, field: string, message: string) {
  const key = keyOf(entity, row);
  if (key !== ctx.originalKey && ctx.existingKeys.has(key)) errors[field] = message;
}

/** Validates and normalises a master-data form. The key field can't be changed when editing (rows refer to it). */
export function validateMaster(entity: MasterEntity, input: FormInput, ctx: MasterContext): Plan<Record<string, unknown>> {
  const errors: Record<string, string> = {};
  let row: Record<string, unknown>;

  switch (entity) {
    case "Branches": {
      const code = ctx.originalKey ?? text(input.branch_code).toUpperCase();
      if (!/^[A-Z0-9][A-Z0-9-]{1,19}$/.test(code)) errors.branch_code = "รหัสสาขาใช้ A–Z, 0–9 และ - (2–20 ตัว)";
      const status = text(input.status) || "Open";
      if (!(BRANCH_STATUSES as readonly string[]).includes(status)) errors.status = "สถานะไม่ถูกต้อง";
      row = {
        branch_code: code,
        branch_name: text(input.branch_name),
        brand: text(input.brand),
        bu: text(input.bu),
        province: text(input.province),
        region: text(input.region),
        status,
        open_date: optionalDate(input.open_date, errors, "open_date"),
        close_date: optionalDate(input.close_date, errors, "close_date"),
      };
      if (!row.branch_name) errors.branch_name = "กรอกชื่อสาขา";
      if (!row.region) errors.region = "กรอกภาค";
      if (row.open_date && row.close_date && (row.close_date as string) < (row.open_date as string)) errors.close_date = "วันปิดต้องไม่ก่อนวันเปิด";
      unique(entity, row, ctx, errors, "branch_code", "มีรหัสสาขานี้แล้ว");
      break;
    }
    case "Positions": {
      const code = ctx.originalKey ?? text(input.position_code).toUpperCase();
      if (!/^[A-Z0-9][A-Z0-9_-]{0,19}$/.test(code)) errors.position_code = "รหัสตำแหน่งใช้ A–Z, 0–9, _ และ - (ไม่เกิน 20 ตัว)";
      const sla = text(input.sla_days);
      if (sla && !(/^\d+$/.test(sla) && Number(sla) >= 1 && Number(sla) <= 365)) errors.sla_days = "SLA ต้องเป็นจำนวนวัน 1–365 (เว้นว่าง = ใช้ค่าเริ่มต้น)";
      row = { position_code: code, position_name: text(input.position_name), position_group: text(input.position_group), sla_days: sla ? Number(sla) : null };
      if (!row.position_name) errors.position_name = "กรอกชื่อตำแหน่ง";
      unique(entity, row, ctx, errors, "position_code", "มีรหัสตำแหน่งนี้แล้ว");
      break;
    }
    case "SourcingChannels": {
      row = { channel: text(input.channel), active: isOn(input.active) };
      if (!row.channel) errors.channel = "กรอกชื่อ Channel";
      unique(entity, row, ctx, errors, "channel", "มี Channel นี้แล้ว");
      break;
    }
    case "RecruiterAssignments": {
      const branch = text(input.branch_code).toUpperCase();
      const group = text(input.position_group);
      const ta = normalizeEmail(text(input.ta_email));
      row = { branch_code: branch, position_group: group, ta_email: ta };
      if (!ctx.branches.some((b) => b.branch_code === branch)) errors.branch_code = "เลือกสาขา";
      if (group && !ctx.positions.some((p) => p.position_group === group)) errors.position_group = "ไม่มีกลุ่มตำแหน่งนี้ในแท็บ Positions";
      const u = ctx.users.find((x) => normalizeEmail(x.email) === ta);
      if (!u || !u.active || u.role === "viewer") errors.ta_email = "เลือก TA ที่ยังใช้งานอยู่";
      unique(entity, row, ctx, errors, "position_group", group ? "สาขานี้ผูก TA กับกลุ่มตำแหน่งนี้แล้ว" : "สาขานี้ผูก TA สำหรับทุกตำแหน่งแล้ว");
      break;
    }
    case "Users": {
      const email = ctx.originalKey ?? normalizeEmail(text(input.email));
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "อีเมลไม่ถูกต้อง";
      const role = text(input.role) as Role;
      if (!ROLES.includes(role)) errors.role = "เลือกสิทธิ์";
      row = { email, name: text(input.name), role, scope: text(input.scope).split(",").map((t) => t.trim()).filter(Boolean).join(", "), active: isOn(input.active) };
      if (!row.name) errors.name = "กรอกชื่อ";
      // Scope tokens must be a region or a branch code, otherwise the user would silently see nothing.
      const known = new Set([...ctx.branches.map((b) => b.region.toLowerCase()), ...ctx.branches.map((b) => b.branch_code.toLowerCase())]);
      const unknown = String(row.scope).split(",").map((t) => t.trim()).filter((t) => t && !known.has(t.toLowerCase()));
      if (unknown.length) errors.scope = `ไม่รู้จัก: ${unknown.join(", ")} (ใส่ชื่อภาคหรือรหัสสาขา คั่นด้วย ,)`;
      // Guard against locking everyone out.
      const self = normalizeEmail(ctx.viewer.email) === email;
      if (self && (role !== "super_admin" || !row.active)) errors.role = "เปลี่ยนสิทธิ์หรือปิดบัญชีของตัวเองไม่ได้";
      const otherAdmins = ctx.users.filter((u) => u.active && u.role === "super_admin" && normalizeEmail(u.email) !== email).length;
      if (!errors.role && otherAdmins === 0 && (role !== "super_admin" || !row.active)) errors.role ="ต้องมีผู้ดูแลระบบที่ใช้งานอยู่อย่างน้อย 1 คน";
      unique(entity, row, ctx, errors, "email", "มีผู้ใช้อีเมลนี้แล้ว");
      break;
    }
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: row };
}

/** People who can own requisitions: active TAs and super_admins. */
export const assignableUsers = (users: User[]) => users.filter((u) => u.active && u.role !== "viewer");

/** super_admin adds requisitions (new store / project / extra headcount); each is one Vacancy. */
export function planNewRequisitions(args: {
  input: FormInput;
  branches: Branch[];
  positions: Position[];
  assignments: Assignment[];
  users: User[];
  viewer: User;
  today: LocalDate;
  ids: () => { reqId: string; logId: string };
  now: Date;
}): Plan<{ requisitions: Requisition[]; log: StatusLogEntry[] }> {
  const { input, viewer, now } = args;
  if (viewer.role !== "super_admin") return { ok: false, errors: { form: "เฉพาะผู้ดูแลระบบเท่านั้น" } };
  const errors: Record<string, string> = {};
  const branch = text(input.branch_code);
  const position = text(input.position_code);
  const b = args.branches.find((x) => x.branch_code === branch);
  const p = args.positions.find((x) => x.position_code === position);
  if (!b) errors.branch_code = "เลือกสาขา";
  if (!p) errors.position_code = "เลือกตำแหน่ง";
  const headcount = Number(text(input.headcount) || "1");
  if (!Number.isInteger(headcount) || headcount < 1 || headcount > 50) errors.headcount = "จำนวนอัตรา 1–50";
  const source = text(input.source) || "Additional";
  if (!(REQUISITION_SOURCES as readonly string[]).includes(source)) errors.source = "เลือกที่มา";
  const requestDate = text(input.request_date) ? parseUserDate(text(input.request_date)) : args.today;
  if (!requestDate) errors.request_date = "วันที่ไม่ถูกต้อง";
  let ta = normalizeEmail(text(input.ta_email));
  if (ta && !assignableUsers(args.users).some((u) => normalizeEmail(u.email) === ta)) errors.ta_email = "เลือก TA ที่ยังใช้งานอยู่";
  if (Object.keys(errors).length || !b || !p || !requestDate) return { ok: false, errors };
  if (!ta) ta = assignTa(branch, p.position_group, args.assignments);

  const at = now.toISOString();
  const requisitions: Requisition[] = [];
  const log: StatusLogEntry[] = [];
  for (let i = 0; i < headcount; i++) {
    const { reqId, logId } = args.ids();
    requisitions.push({
      id: reqId, branch_code: branch, position_code: position, request_date: requestDate, source, source_ref: `WEB:${at}:${i + 1}`, ta_email: ta,
      status: "Vacancy", status_date: requestDate, offer_id: "", closed_at: null, version: 1, created_at: at, updated_at: at,
    });
    log.push({ id: logId, req_id: reqId, from_status: "", to_status: "Vacancy", effective_date: requestDate, actor: viewer.email, at, note: `เพิ่มผ่านเว็บ (${source})${text(input.note) ? `: ${text(input.note)}` : ""}`, ref_id: "" });
  }
  return { ok: true, value: { requisitions, log } };
}

/**
 * super_admin edits a requisition's request date and/or owner. Each change is logged with old -> new;
 * these log rows ("RequestDateChange", "OwnerChange") don't change the status.
 */
export function planRequisitionEdit(args: {
  req: Requisition;
  input: { requestDate: string; taEmail: string; reason: string };
  users: User[];
  viewer: User;
  ids: () => string;
  now: Date;
}): Plan<{ patch: Partial<Requisition>; log: StatusLogEntry[] }> {
  const { req, viewer, now } = args;
  if (viewer.role !== "super_admin") return { ok: false, errors: { form: "แก้ไขได้เฉพาะผู้ดูแลระบบ" } };
  const errors: Record<string, string> = {};
  const date = parseUserDate(text(args.input.requestDate));
  if (!date) errors.requestDate = "วันที่ไม่ถูกต้อง";
  const ta = normalizeEmail(text(args.input.taEmail));
  const nameOf = (e: string) => args.users.find((u) => normalizeEmail(u.email) === normalizeEmail(e))?.name || e || "ยังไม่มีเจ้าของ";
  if (ta && !assignableUsers(args.users).some((u) => normalizeEmail(u.email) === ta)) errors.taEmail = "เลือก TA ที่ยังใช้งานอยู่";
  const reason = text(args.input.reason);
  if (!reason) errors.reason = "กรอกเหตุผลที่แก้ไข";
  if (Object.keys(errors).length || !date) return { ok: false, errors };

  const patch: Partial<Requisition> = {};
  const log: StatusLogEntry[] = [];
  const at = now.toISOString();
  const entry = (to: string, note: string): StatusLogEntry => ({ id: args.ids(), req_id: req.id, from_status: req.status, to_status: to, effective_date: at.slice(0, 10), actor: viewer.email, at, note, ref_id: "" });
  if (date !== req.request_date) {
    patch.request_date = date;
    log.push(entry("RequestDateChange", `วันที่แจ้งสรรหา ${formatThaiDate(req.request_date)} → ${formatThaiDate(date)}: ${reason}`));
  }
  if (ta !== normalizeEmail(req.ta_email)) {
    patch.ta_email = ta;
    log.push(entry("OwnerChange", `เจ้าของ ${nameOf(req.ta_email)} → ${nameOf(ta)}: ${reason}`));
  }
  if (log.length === 0) return { ok: false, errors: { form: "ไม่มีอะไรเปลี่ยน" } };
  return { ok: true, value: { patch, log } };
}
