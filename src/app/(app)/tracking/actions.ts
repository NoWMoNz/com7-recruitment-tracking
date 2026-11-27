"use server";

import { getSessionUser } from "@/lib/auth/session-user";
import { planRequest } from "@/lib/domain/approval";
import { planBranchTaName, planRequisitionTaName } from "@/lib/domain/branch-ta";
import { todayBangkok } from "@/lib/domain/dates";
import { planOffer, planOfferEdit, planTurndown, type OfferInput } from "@/lib/domain/offer";
import { parseSettings } from "@/lib/domain/settings";
import type { ApprovalType } from "@/lib/domain/types";
import { EVIDENCE_TYPES, MAX_EVIDENCE_BYTES, saveEvidence } from "@/lib/evidence/store";
import { getRepo } from "@/lib/repo";
import { CONFLICT, fail, GONE, newId, writeError, type ActionResult } from "../action-utils";

/**
 * Vacancy -> Offer. The requisition is updated first with a version check, so if two people submit at
 * once only one wins; the Offer and StatusLog rows are appended after that.
 */
export async function submitOffer(reqId: string, expectedVersion: number, input: OfferInput): Promise<ActionResult> {
  const viewer = await getSessionUser();
  const repo = getRepo();
  const [req, settingRows, channelRows, log] = await Promise.all([
    repo.getFresh("Requisitions", reqId),
    repo.list("Settings"),
    repo.list("SourcingChannels"),
    repo.list("StatusLog"),
  ]);
  if (!req) return fail(GONE);
  if (req.version !== expectedVersion) return fail(CONFLICT);

  const plan = planOffer({
    req,
    input,
    viewer,
    today: todayBangkok(),
    settings: parseSettings(settingRows),
    channels: channelRows.filter((c) => c.active).map((c) => c.channel),
    log,
    ids: { offerId: newId("OFF"), logId: newId("LOG") },
    now: new Date(),
  });
  if (!plan.ok) return plan;

  try {
    await repo.update("Requisitions", req.id, plan.value.reqPatch, expectedVersion);
    await repo.append("Offers", [plan.value.offer]);
    await repo.append("StatusLog", [plan.value.logEntry]);
  } catch (e) {
    return writeError(e);
  }
  return { ok: true };
}

/**
 * Corrects a saved Offer: every field within 2 hours of saving it (always for super_admin), afterwards only the
 * start date. A changed offer date moves the requisition's status date (version-checked, written first) and its log row.
 */
export async function submitOfferEdit(reqId: string, expectedVersion: number, input: OfferInput): Promise<ActionResult> {
  const viewer = await getSessionUser();
  const repo = getRepo();
  const [req, settingRows, channelRows, log] = await Promise.all([
    repo.getFresh("Requisitions", reqId),
    repo.list("Settings"),
    repo.list("SourcingChannels"),
    repo.list("StatusLog"),
  ]);
  if (!req) return fail(GONE);
  if (req.version !== expectedVersion) return fail(CONFLICT);
  const offer = req.offer_id ? await repo.getFresh("Offers", req.offer_id) : null;

  const plan = planOfferEdit({
    req,
    offer,
    input,
    viewer,
    today: todayBangkok(),
    settings: parseSettings(settingRows),
    channels: channelRows.filter((c) => c.active).map((c) => c.channel),
    log,
    now: new Date(),
  });
  if (!plan.ok) return plan;

  const { offerPatch, reqPatch, logPatch } = plan.value;
  try {
    if (reqPatch) await repo.update("Requisitions", req.id, reqPatch, expectedVersion);
    await repo.update("Offers", offer!.id, offerPatch);
    if (logPatch) await repo.update("StatusLog", logPatch.id, logPatch.patch);
  } catch (e) {
    return writeError(e);
  }
  return { ok: true };
}

/** Offer -> Vacancy. The person moves from Offers to Turndowns; the requisition keeps its request date. */
export async function submitTurndown(reqId: string, expectedVersion: number, input: { date: string; reason: string }): Promise<ActionResult> {
  const viewer = await getSessionUser();
  const repo = getRepo();
  const [req, settingRows] = await Promise.all([repo.getFresh("Requisitions", reqId), repo.list("Settings")]);
  if (!req) return fail(GONE);
  if (req.version !== expectedVersion) return fail(CONFLICT);
  const offer = req.offer_id ? await repo.getFresh("Offers", req.offer_id) : null;

  const plan = planTurndown({
    req,
    offer,
    input,
    viewer,
    today: todayBangkok(),
    settings: parseSettings(settingRows),
    ids: { logId: newId("LOG") },
    now: new Date(),
  });
  if (!plan.ok) return plan;

  try {
    await repo.update("Requisitions", req.id, plan.value.reqPatch, expectedVersion);
    await repo.append("Turndowns", [plan.value.turndown]);
    await repo.remove("Offers", plan.value.turndown.id);
    await repo.append("StatusLog", [plan.value.logEntry]);
  } catch (e) {
    return writeError(e);
  }
  return { ok: true };
}

/**
 * Vacancy -> PendingCancel / PendingHold with a mandatory photo. Sent as FormData because of the file.
 * The photo is stored only after everything else validates, so rejected forms leave no orphan files.
 */
export async function submitApprovalRequest(form: FormData): Promise<ActionResult> {
  const viewer = await getSessionUser();
  const reqId = String(form.get("reqId") ?? "");
  const expectedVersion = Number(form.get("version"));
  const type = String(form.get("type")) as ApprovalType;
  if (type !== "Cancel" && type !== "Hold") return fail("ประเภทคำขอไม่ถูกต้อง");
  const input = { date: String(form.get("date") ?? ""), reason: String(form.get("reason") ?? "") };

  const file = form.get("evidence");
  let fileError: string | null = null;
  if (!(file instanceof File) || file.size === 0) fileError = "ต้องแนบรูปหลักฐาน";
  else if (!EVIDENCE_TYPES[file.type]) fileError = "รองรับเฉพาะไฟล์ JPG, PNG, WEBP หรือ HEIC";
  else if (file.size > MAX_EVIDENCE_BYTES) fileError = "รูปต้องมีขนาดไม่เกิน 5MB";

  const repo = getRepo();
  const [req, settingRows] = await Promise.all([repo.getFresh("Requisitions", reqId), repo.list("Settings")]);
  if (!req) return fail(GONE);
  if (req.version !== expectedVersion) return fail(CONFLICT);

  const base = {
    req,
    type,
    input,
    viewer,
    today: todayBangkok(),
    settings: parseSettings(settingRows),
    ids: { approvalId: newId("APR"), logId: newId("LOG") },
    now: new Date(),
  };
  const check = planRequest({ ...base, evidenceRef: fileError ? null : "pending" });
  if (!check.ok || fileError) {
    const errors = check.ok ? {} : check.errors;
    return { ok: false, errors: fileError ? { ...errors, evidence: fileError } : errors };
  }

  let evidenceRef: string;
  try {
    evidenceRef = await saveEvidence(file as File);
  } catch (e) {
    console.error("[action] evidence upload failed", e);
    return { ok: false, errors: { evidence: "อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่" } };
  }
  const plan = planRequest({ ...base, evidenceRef });
  if (!plan.ok) return plan;

  try {
    await repo.update("Requisitions", req.id, plan.value.reqPatch, expectedVersion);
    await repo.append("Approvals", [plan.value.approval]);
    await repo.append("StatusLog", [plan.value.logEntry]);
  } catch (e) {
    return writeError(e);
  }
  return { ok: true };
}

/**
 * Sets a shop's TA by name: the Branches row first, then its open positions that had their own TA name
 * (version-checked, so one edited meanwhile stops the rest), then the log.
 */
export async function changeBranchTa(branchCode: string, name: string): Promise<ActionResult> {
  const viewer = await getSessionUser();
  const repo = getRepo();
  const [branchRows, users, requisitions] = await Promise.all([repo.listNumbered("Branches"), repo.list("Users"), repo.list("Requisitions")]);
  const hit = branchRows.find((b) => b.row.branch_code === branchCode);
  const plan = planBranchTaName({ branch: hit?.row, name, viewer, users, requisitions, ids: () => newId("LOG"), now: new Date(), today: todayBangkok() });
  if (!plan.ok) return plan;

  const { branchTa, reqPatches, log } = plan.value;
  try {
    await repo.updateAt("Branches", [{ rowNumber: hit!.rowNumber, patch: { ta: branchTa } }]);
    if (reqPatches.length) await repo.updateMany("Requisitions", reqPatches);
    if (log.length) await repo.append("StatusLog", log);
  } catch (e) {
    return writeError(e);
  }
  return { ok: true };
}

/** Sets the TA of one open position by name (or back to the shop's TA). */
export async function changeRequisitionTa(reqId: string, expectedVersion: number, name: string): Promise<ActionResult> {
  const viewer = await getSessionUser();
  const repo = getRepo();
  const [req, branches, users] = await Promise.all([repo.getFresh("Requisitions", reqId), repo.list("Branches"), repo.list("Users")]);
  if (!req) return fail(GONE);
  if (req.version !== expectedVersion) return fail(CONFLICT);
  const plan = planRequisitionTaName({
    req,
    branch: branches.find((b) => b.branch_code === req.branch_code),
    name,
    viewer,
    users,
    ids: () => newId("LOG"),
    now: new Date(),
    today: todayBangkok(),
  });
  if (!plan.ok) return plan;
  try {
    await repo.update("Requisitions", reqId, plan.value.patch, plan.value.expectedVersion);
    await repo.append("StatusLog", [plan.value.log]);
  } catch (e) {
    return writeError(e);
  }
  return { ok: true };
}
