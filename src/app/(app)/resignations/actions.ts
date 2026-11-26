"use server";

import { getSessionUser } from "@/lib/auth/session-user";
import { planNewResignation, type NewResignInput } from "@/lib/domain/resign";
import { runProcessor } from "@/lib/processor/run";
import { getRepo } from "@/lib/repo";
import { runWithdrawal } from "@/lib/resign/withdraw";
import { writeError, type ActionResult } from "../action-utils";

/**
 * ยกเลิกลาออก. A Vacancy opened for this resignation is closed at once; an Offer or other open status goes to the
 * admin's review list; the resignation row records who withdrew it and why.
 */
export async function withdrawResignation(input: { rowNumber: number; employeeId: string; effectiveDate: string; note: string }): Promise<ActionResult> {
  const viewer = await getSessionUser();
  try {
    const res = await runWithdrawal(getRepo(), viewer, input);
    return res.ok ? { ok: true } : res;
  } catch (e) {
    return writeError(e);
  }
}

/**
 * เพิ่มรายชื่อลาออก in the web. The row goes into Import_Resign like one typed in the Sheet. A super_admin has it
 * processed at once (the same run as the Process page's button); a TA's waits for an admin to process it.
 */
export async function addResignation(input: NewResignInput): Promise<ActionResult & { processed?: boolean }> {
  const viewer = await getSessionUser();
  const repo = getRepo();
  try {
    const [existing, branches, positions] = await Promise.all([repo.list("Import_Resign"), repo.list("Branches"), repo.list("Positions")]);
    const plan = planNewResignation({ input, existing, branches, positions, viewer });
    if (!plan.ok) return plan;
    await repo.append("Import_Resign", [plan.value.row]);
    await repo.invalidate("Import_Resign");
  } catch (e) {
    return writeError(e);
  }
  if (viewer.role !== "super_admin") return { ok: true, processed: false };
  try {
    await runProcessor(viewer.email);
  } catch (e) {
    console.error("[resign] saved but processing failed", e);
    return { ok: false, errors: { form: "บันทึกรายชื่อแล้ว แต่ประมวลผลไม่สำเร็จ ไปที่หน้า \"ประมวลผลข้อมูล\" แล้วกดประมวลผลอีกครั้ง (อย่าเพิ่มซ้ำ)" } };
  }
  return { ok: true, processed: true };
}
