import type { RecruiterAssignment } from "@/lib/repo/types";
import { assignableUsers } from "./master";
import type { Plan } from "./offer";
import { NOT_CLOSED } from "./people";
import { inScope, normalizeEmail } from "./permissions";
import type { Branch, LocalDate, Requisition, StatusLogEntry, User } from "./types";

/**
 * A TA (or super_admin) hands a branch to another TA: the branch's assignment rules become one branch-wide rule
 * for the new TA, and every not-closed position of the branch moves to them. Each moved position gets an
 * "OwnerChange" log row, the same one super_admin's per-position edit writes.
 */
export function planBranchTaChange(args: {
  branch: Branch | undefined;
  taEmail: string;
  viewer: User;
  users: User[];
  assignments: { rowNumber: number; row: RecruiterAssignment }[];
  requisitions: Requisition[];
  ids: () => string;
  now: Date;
  today: LocalDate;
}): Plan<{
  removeRows: number[];
  assignment: RecruiterAssignment;
  reqPatches: { id: string; patch: { ta_email: string }; expectedVersion: number }[];
  log: StatusLogEntry[];
}> {
  const { branch, viewer } = args;
  if (viewer.role !== "ta" && viewer.role !== "super_admin") return { ok: false, errors: { form: "เปลี่ยน TA ได้เฉพาะ TA และผู้ดูแลระบบ" } };
  if (!branch || !inScope(viewer, branch)) return { ok: false, errors: { form: "ไม่พบสาขานี้ในขอบเขตของคุณ" } };
  const ta = normalizeEmail(args.taEmail);
  if (!ta || !assignableUsers(args.users).some((u) => normalizeEmail(u.email) === ta)) return { ok: false, errors: { taEmail: "เลือก TA ที่ยังใช้งานอยู่" } };

  const code = branch.branch_code;
  const nameOf = (e: string) => args.users.find((u) => normalizeEmail(u.email) === normalizeEmail(e))?.name || e || "ยังไม่มีเจ้าของ";
  const mine = args.assignments.filter((a) => a.row.branch_code === code);
  const moving = args.requisitions.filter((r) => r.branch_code === code && NOT_CLOSED.includes(r.status) && normalizeEmail(r.ta_email) !== ta);
  const alreadySet = mine.length === 1 && !mine[0].row.position_group.trim() && normalizeEmail(mine[0].row.ta_email) === ta;
  if (alreadySet && moving.length === 0) return { ok: false, errors: { form: "ไม่มีอะไรเปลี่ยน" } };

  const at = args.now.toISOString();
  return {
    ok: true,
    value: {
      removeRows: mine.map((a) => a.rowNumber),
      assignment: { branch_code: code, position_group: "", ta_email: ta },
      reqPatches: moving.map((r) => ({ id: r.id, patch: { ta_email: ta }, expectedVersion: r.version })),
      log: moving.map((r) => ({
        id: args.ids(),
        req_id: r.id,
        from_status: r.status,
        to_status: "OwnerChange",
        effective_date: args.today,
        actor: viewer.email,
        at,
        note: `เจ้าของ ${nameOf(r.ta_email)} → ${nameOf(ta)}: เปลี่ยน TA ประจำสาขา`,
        ref_id: "",
      })),
    },
  };
}
