import "server-only";
import { randomUUID } from "node:crypto";
import { ConflictError, MissingColumnError, MissingTabError, NotFoundError } from "@/lib/repo";

export type ActionResult = { ok: true } | { ok: false; errors: Record<string, string> };

export const CONFLICT = "ข้อมูลนี้ถูกแก้โดยคนอื่นระหว่างที่คุณทำรายการ กรุณาปิดหน้าต่างแล้วโหลดใหม่";
export const GONE = "ไม่พบรายการนี้แล้ว กรุณาโหลดใหม่";

export const newId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;

export function fail(message: string): ActionResult {
  return { ok: false, errors: { form: message } };
}

export function writeError(e: unknown): ActionResult {
  if (e instanceof ConflictError) return fail(CONFLICT);
  if (e instanceof NotFoundError) return fail(GONE);
  if (e instanceof MissingColumnError || e instanceof MissingTabError) return fail(e.message);
  console.error("[action] write failed", e);
  return fail("บันทึกไม่สำเร็จ กรุณาลองใหม่");
}
