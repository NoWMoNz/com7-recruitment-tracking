import type { Plan } from "./offer";
import { NOT_CLOSED, taOf } from "./people";
import { canEditRequisition, inScope, normalizeEmail } from "./permissions";
import type { Branch, LocalDate, Requisition, StatusLogEntry, User } from "./types";

/**
 * TAs are named as in HR's database (e.g. "Chuthathip"). A shop's TA is its Branches `ta`; a position can carry
 * its own name in `ta_name`, which wins over the shop's (see taOf). Every change is logged as "OwnerChange".
 */

const MAX_NAME = 60;

function cleanName(raw: string): { name: string } | { error: string } {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) return { error: "กรอกชื่อ TA" };
  if (name.length > MAX_NAME) return { error: `ชื่อ TA ยาวไม่เกิน ${MAX_NAME} ตัวอักษร` };
  return { name };
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function nameOfUser(users: User[]) {
  const byEmail = new Map(users.map((u) => [normalizeEmail(u.email), u.name]));
  return (email: string) => byEmail.get(email);
}

function ownerChange(args: { id: string; req: Requisition; viewer: User; now: Date; today: LocalDate; note: string }): StatusLogEntry {
  return {
    id: args.id,
    req_id: args.req.id,
    from_status: args.req.status,
    to_status: "OwnerChange",
    effective_date: args.today,
    actor: args.viewer.email,
    at: args.now.toISOString(),
    note: args.note,
    ref_id: "",
  };
}

/**
 * Anyone who works on positions (TA, admin, super_admin) sets a shop's TA by name. Its not-closed positions
 * follow the shop: a name set on one of them is cleared, and each one whose TA changes is logged.
 */
export function planBranchTaName(args: {
  branch: Branch | undefined;
  name: string;
  viewer: User;
  users: User[];
  requisitions: Requisition[];
  ids: () => string;
  now: Date;
  today: LocalDate;
}): Plan<{ branchTa: string; reqPatches: { id: string; patch: { ta_name: string }; expectedVersion: number }[]; log: StatusLogEntry[] }> {
  const { branch, viewer } = args;
  if (viewer.role === "viewer") return { ok: false, errors: { form: "เปลี่ยน TA ได้เฉพาะ TA แอดมิน และผู้ดูแลระบบ" } };
  if (!branch || !inScope(viewer, branch)) return { ok: false, errors: { form: "ไม่พบสาขานี้ในขอบเขตของคุณ" } };
  const cleaned = cleanName(args.name);
  if ("error" in cleaned) return { ok: false, errors: { name: cleaned.error } };
  const { name } = cleaned;

  const nameOf = nameOfUser(args.users);
  const open = args.requisitions.filter((r) => r.branch_code === branch.branch_code && NOT_CLOSED.includes(r.status));
  const overridden = open.filter((r) => r.ta_name?.trim());
  if (sameName(branch.ta ?? "", name) && overridden.length === 0) return { ok: false, errors: { form: "ไม่มีอะไรเปลี่ยน" } };

  const log = open.flatMap((r) => {
    const before = taOf(branch, r.ta_email, nameOf, r.ta_name).taName || "ยังไม่มีเจ้าของ";
    return sameName(before, name) ? [] : [ownerChange({ id: args.ids(), req: r, viewer, now: args.now, today: args.today, note: `TA ${before} → ${name}: เปลี่ยน TA ประจำสาขา` })];
  });
  return {
    ok: true,
    value: {
      branchTa: name,
      reqPatches: overridden.map((r) => ({ id: r.id, patch: { ta_name: "" }, expectedVersion: r.version })),
      log,
    },
  };
}

/** Sets the TA of one open position by name; picking the shop's own TA clears it, so it follows the shop again. */
export function planRequisitionTaName(args: {
  req: Requisition;
  branch: Branch | undefined;
  name: string;
  viewer: User;
  users: User[];
  ids: () => string;
  now: Date;
  today: LocalDate;
}): Plan<{ patch: { ta_name: string }; expectedVersion: number; log: StatusLogEntry }> {
  const { req, branch, viewer } = args;
  if (!canEditRequisition(viewer, req)) return { ok: false, errors: { form: "คุณไม่ได้เป็นผู้รับผิดชอบตำแหน่งนี้" } };
  if (!NOT_CLOSED.includes(req.status)) return { ok: false, errors: { form: "ตำแหน่งนี้ปิดแล้ว" } };
  const cleaned = cleanName(args.name);
  if ("error" in cleaned) return { ok: false, errors: { name: cleaned.error } };
  const { name } = cleaned;

  const nameOf = nameOfUser(args.users);
  const before = taOf(branch, req.ta_email, nameOf, req.ta_name).taName || "ยังไม่มีเจ้าของ";
  if (sameName(before, name)) return { ok: false, errors: { form: "ไม่มีอะไรเปลี่ยน" } };
  const ta_name = sameName(branch?.ta ?? "", name) ? "" : name;
  return {
    ok: true,
    value: {
      patch: { ta_name },
      expectedVersion: req.version,
      log: ownerChange({ id: args.ids(), req, viewer, now: args.now, today: args.today, note: `TA ${before} → ${name}: ${ta_name ? "เฉพาะตำแหน่งนี้" : "กลับไปใช้ TA ประจำสาขา"}` }),
    },
  };
}

/** TA names to pick from: every name used for a shop or a position, sorted. */
export function taNameChoices(branches: Pick<Branch, "ta">[], requisitions: Pick<Requisition, "ta_name">[]): string[] {
  const seen = new Map<string, string>();
  for (const n of [...branches.map((b) => b.ta), ...requisitions.map((r) => r.ta_name)]) {
    const t = (n ?? "").trim();
    if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "th"));
}
