"use server";

import { getSessionUser } from "@/lib/auth/session-user";
import { todayBangkok } from "@/lib/domain/dates";
import { hireFromOffer } from "@/lib/domain/processor";
import { parseSettings } from "@/lib/domain/settings";
import { ConflictError, getRepo } from "@/lib/repo";
import { runProcessor, type RunSummary } from "@/lib/processor/run";
import { fail, GONE, newId, writeError, type ActionResult } from "../action-utils";

const ADMIN_ONLY = "เฉพาะผู้ดูแลระบบเท่านั้น";

export async function runProcessingNow(): Promise<{ ok: true; summary: RunSummary } | { ok: false; error: string }> {
  const viewer = await getSessionUser();
  if (viewer.role !== "super_admin") return { ok: false, error: ADMIN_ONLY };
  try {
    return { ok: true, summary: await runProcessor(viewer.email) };
  } catch (e) {
    if (e instanceof ConflictError) return { ok: false, error: "มีคนแก้ข้อมูลระหว่างประมวลผล ยังไม่มีอะไรถูกเขียน กรุณากดประมวลผลอีกครั้ง" };
    console.error("[process] run failed", e);
    return { ok: false, error: "ประมวลผลไม่สำเร็จ กรุณาลองใหม่" };
  }
}

/** Marks a review item as handled (e.g. after fixing the Sheet or deciding a closed-store Offer). */
export async function resolveReview(reviewId: string): Promise<ActionResult> {
  const viewer = await getSessionUser();
  if (viewer.role !== "super_admin") return fail(ADMIN_ONLY);
  const repo = getRepo();
  const item = await repo.getFresh("ReviewQueue", reviewId);
  if (!item) return fail(GONE);
  if (item.resolved_at) return { ok: true };
  try {
    await repo.update("ReviewQueue", reviewId, { resolved_by: viewer.email, resolved_at: new Date().toISOString() });
  } catch (e) {
    return writeError(e);
  }
  return { ok: true };
}

/** super_admin picks the Offer for a new employee the processor couldn't match on its own. */
export async function matchHire(reviewId: string, offerId: string): Promise<ActionResult> {
  const viewer = await getSessionUser();
  if (viewer.role !== "super_admin") return fail(ADMIN_ONLY);
  const repo = getRepo();
  const item = await repo.getFresh("ReviewQueue", reviewId);
  if (!item || item.type !== "UnmatchedHire") return fail(GONE);
  if (item.resolved_at) return fail("รายการนี้จับคู่ไปแล้ว");

  const m = /^NEW:r(\d+):(.+)$/.exec(item.ref);
  if (!m) return fail("ไม่พบแถวพนักงานใหม่ของรายการนี้");
  const rowNumber = Number(m[1]);
  const employeeId = m[2];
  const rows = await repo.listNumbered("Import_NewEmployee");
  const source = rows.find((r) => r.rowNumber === rowNumber && r.row.employee_id.trim() === employeeId);
  if (!source) return fail(`แถว ${rowNumber} ในแท็บ Import_NewEmployee ไม่ใช่รหัส ${employeeId} แล้ว กรุณาประมวลผลใหม่`);

  const offer = await repo.getFresh("Offers", offerId);
  if (!offer) return fail("ไม่พบคน Offer นี้แล้ว กรุณาโหลดใหม่");
  const req = await repo.getFresh("Requisitions", offer.req_id);
  if (!req || req.status !== "Offer" || req.offer_id !== offer.id) return fail("ตำแหน่งของคน Offer นี้ไม่ได้อยู่ในสถานะ Offer แล้ว");

  const [settingRows, positions, log] = await Promise.all([repo.list("Settings"), repo.list("Positions"), repo.list("StatusLog")]);
  const today = todayBangkok();
  const hire = hireFromOffer({
    offer,
    req,
    employee: source.row,
    today,
    settings: parseSettings(settingRows),
    log,
    positions: new Map(positions.map((p) => [p.position_code, p])),
  });
  const at = new Date().toISOString();

  try {
    await repo.update("Requisitions", req.id, hire.reqPatch, req.version);
    await repo.append("NewHires", [hire.newHire]);
    await repo.remove("Offers", offer.id);
    await repo.append("StatusLog", [
      { id: newId("LOG"), req_id: req.id, from_status: "Offer", to_status: "Hired", effective_date: today, actor: viewer.email, at, note: `จับคู่เอง รหัสพนักงาน ${employeeId}`, ref_id: offer.id },
    ]);
    await repo.updateAt("Import_NewEmployee", [{ rowNumber, patch: { processed_at: at, matched_req_id: req.id } }]);
    await repo.update("ReviewQueue", item.id, { resolved_by: viewer.email, resolved_at: at });
  } catch (e) {
    return writeError(e);
  }
  return { ok: true };
}
