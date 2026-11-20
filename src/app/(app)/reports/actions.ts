"use server";

import { getSessionUser } from "@/lib/auth/session-user";
import { todayBangkok } from "@/lib/domain/dates";
import { monthOf } from "@/lib/domain/report";
import { getRepo } from "@/lib/repo";
import { writeSnapshot } from "@/lib/report/snapshot";
import { fail, type ActionResult } from "../action-utils";

/** super_admin re-closes a past month after a correction; reports then use the new figures. */
export async function recomputeMonth(month: string): Promise<ActionResult> {
  const viewer = await getSessionUser();
  if (viewer.role !== "super_admin") return fail("เฉพาะผู้ดูแลระบบเท่านั้น");
  const today = todayBangkok();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month >= monthOf(today)) return fail("คำนวณใหม่ได้เฉพาะเดือนที่จบไปแล้ว");
  try {
    await writeSnapshot(getRepo(), month, today, new Date().toISOString());
  } catch (e) {
    console.error("[reports] recompute failed", e);
    return fail("คำนวณไม่สำเร็จ กรุณาลองใหม่");
  }
  return { ok: true };
}
