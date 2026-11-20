"use server";

import { getSessionUser } from "@/lib/auth/session-user";
import { todayBangkok } from "@/lib/domain/dates";
import { keyOf, planNewRequisitions, planRequisitionEdit, validateMaster, type FormInput, type MasterEntity } from "@/lib/domain/master";
import { getRepo } from "@/lib/repo";
import { CONFLICT, fail, GONE, newId, writeError, type ActionResult } from "../action-utils";

const ADMIN_ONLY = "เฉพาะผู้ดูแลระบบเท่านั้น";
const ENTITIES: MasterEntity[] = ["Branches", "Positions", "SourcingChannels", "RecruiterAssignments", "Users"];

async function admin() {
  const viewer = await getSessionUser();
  return viewer.role === "super_admin" ? viewer : null;
}

/** Add (originalKey = null) or edit one master-data row. Rows are matched by their natural key. */
export async function saveMaster(entity: MasterEntity, originalKey: string | null, input: FormInput): Promise<ActionResult> {
  const viewer = await admin();
  if (!viewer) return fail(ADMIN_ONLY);
  if (!ENTITIES.includes(entity)) return fail("ข้อมูลไม่ถูกต้อง");
  const repo = getRepo();
  const [rows, branches, positions, users] = await Promise.all([repo.listNumbered(entity), repo.list("Branches"), repo.list("Positions"), repo.list("Users")]);
  const keyed = rows.map((r) => ({ ...r, key: keyOf(entity, r.row as unknown as Record<string, unknown>) }));
  const current = originalKey === null ? null : keyed.find((r) => r.key === originalKey);
  if (originalKey !== null && !current) return fail(GONE);

  const plan = validateMaster(entity, input, { existingKeys: new Set(keyed.map((r) => r.key)), originalKey, branches, positions, users, viewer });
  if (!plan.ok) return plan;
  try {
    if (current) await repo.updateAt(entity, [{ rowNumber: current.rowNumber, patch: plan.value as never }]);
    else await repo.append(entity, [plan.value as never]);
  } catch (e) {
    return writeError(e);
  }
  return { ok: true };
}

/** Recruiter assignments are the only master rows that can be deleted (others are referenced elsewhere). */
export async function removeAssignment(key: string): Promise<ActionResult> {
  if (!(await admin())) return fail(ADMIN_ONLY);
  const repo = getRepo();
  const rows = await repo.listNumbered("RecruiterAssignments");
  const hit = rows.find((r) => keyOf("RecruiterAssignments", r.row as unknown as Record<string, unknown>) === key);
  if (!hit) return fail(GONE);
  try {
    await repo.removeAt("RecruiterAssignments", [hit.rowNumber]);
  } catch (e) {
    return writeError(e);
  }
  return { ok: true };
}

/** New store / project / extra headcount, entered in the web instead of the Import_Requisition tab. */
export async function createRequisitions(input: FormInput): Promise<ActionResult & { created?: number }> {
  const viewer = await admin();
  if (!viewer) return fail(ADMIN_ONLY);
  const repo = getRepo();
  const [branches, positions, assignments, users] = await Promise.all([repo.list("Branches"), repo.list("Positions"), repo.list("RecruiterAssignments"), repo.list("Users")]);
  const plan = planNewRequisitions({ input, branches, positions, assignments, users, viewer, today: todayBangkok(), ids: () => ({ reqId: newId("REQ"), logId: newId("LOG") }), now: new Date() });
  if (!plan.ok) return plan;
  try {
    await repo.append("Requisitions", plan.value.requisitions);
    await repo.append("StatusLog", plan.value.log);
  } catch (e) {
    return writeError(e);
  }
  return { ok: true, created: plan.value.requisitions.length };
}

/** super_admin edits a requisition's request date and/or TA owner; both are logged. */
export async function editRequisition(reqId: string, expectedVersion: number, input: { requestDate: string; taEmail: string; reason: string }): Promise<ActionResult> {
  const viewer = await admin();
  if (!viewer) return fail("แก้ไขได้เฉพาะผู้ดูแลระบบ");
  const repo = getRepo();
  const [req, users] = await Promise.all([repo.getFresh("Requisitions", reqId), repo.list("Users")]);
  if (!req) return fail(GONE);
  if (req.version !== expectedVersion) return fail(CONFLICT);
  const plan = planRequisitionEdit({ req, input, users, viewer, ids: () => newId("LOG"), now: new Date() });
  if (!plan.ok) return plan;
  try {
    await repo.update("Requisitions", req.id, plan.value.patch, expectedVersion);
    await repo.append("StatusLog", plan.value.log);
  } catch (e) {
    return writeError(e);
  }
  return { ok: true };
}
