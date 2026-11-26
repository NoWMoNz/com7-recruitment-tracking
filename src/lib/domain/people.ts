import type { RecruiterAssignment } from "@/lib/repo/types";
import { normalizeEmail } from "./permissions";
import type { Branch, Requisition, Status, User } from "./types";

/** Who a figure belongs to: the branch's Area / Regional Manager and the TA who owns it (email, any case). */
export interface People {
  am: string;
  rm: string;
  taEmail: string;
}

/** AM / RM / TA filters; empty = any. `ta` is an email in any case. */
export interface PeopleFilter {
  am?: string;
  rm?: string;
  ta?: string;
}

export interface PeopleOptions {
  ams: string[];
  rms: string[];
  tas: { value: string; label: string }[];
}

/** Statuses that are not closed yet: they move with the branch when its TA changes. */
export const NOT_CLOSED: readonly Status[] = ["Vacancy", "Offer", "PendingCancel", "PendingHold", "Hold"];

export function matchesPeople(x: People, f: PeopleFilter): boolean {
  if (f.am && x.am !== f.am) return false;
  if (f.rm && x.rm !== f.rm) return false;
  if (f.ta && normalizeEmail(x.taEmail) !== normalizeEmail(f.ta)) return false;
  return true;
}

const byThai = (a: string, b: string) => a.localeCompare(b, "th");

/** Dropdown choices from what is on screen; blank names are not choices. */
export function peopleOptions(items: (People & { taName?: string })[]): PeopleOptions {
  const ams = new Set<string>();
  const rms = new Set<string>();
  const tas = new Map<string, string>();
  for (const x of items) {
    if (x.am) ams.add(x.am);
    if (x.rm) rms.add(x.rm);
    const ta = normalizeEmail(x.taEmail);
    if (ta && (!tas.has(ta) || (x.taName && tas.get(ta) === ta))) tas.set(ta, x.taName || ta);
  }
  return {
    ams: [...ams].sort(byThai),
    rms: [...rms].sort(byThai),
    tas: [...tas].map(([value, label]) => ({ value, label })).sort((a, b) => byThai(a.label, b.label)),
  };
}

/**
 * The TA a branch belongs to: its branch-wide assignment, else whoever owns most of its not-closed
 * positions (ties go alphabetically), else "".
 */
export function branchTaOf(branchCode: string, assignments: RecruiterAssignment[], requisitions: Requisition[]): string {
  const wide = assignments.find((a) => a.branch_code === branchCode && !a.position_group.trim() && a.ta_email.trim());
  if (wide) return normalizeEmail(wide.ta_email);
  const count = new Map<string, number>();
  for (const r of requisitions) {
    if (r.branch_code !== branchCode || !NOT_CLOSED.includes(r.status) || !r.ta_email.trim()) continue;
    const ta = normalizeEmail(r.ta_email);
    count.set(ta, (count.get(ta) ?? 0) + 1);
  }
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "";
}

export function peopleOfBranch(b: Pick<Branch, "am" | "rm"> | undefined): { am: string; rm: string } {
  return { am: (b?.am ?? "").trim(), rm: (b?.rm ?? "").trim() };
}

/** What a branch's header on the tracking page knows: who manages it, who owns it, and what a hand-over would move. */
export interface BranchHead {
  am: string;
  rm: string;
  /** The branch's TA (see branchTaOf), normalized; "" when unknown. */
  taEmail: string;
  taName: string;
  /** Not-closed positions of the branch, and how many each TA (normalized email) owns. */
  open: number;
  owned: Record<string, number>;
  /** The TA of the branch's only assignment rule when it is a single branch-wide one; "" otherwise. */
  ruleOnlyFor: string;
  /** False for a code that is not in Branches (its TA cannot be changed). */
  known: boolean;
}

/** Headers for the given branch codes in one pass over requisitions and rules. */
export function branchHeads(codes: string[], branches: Branch[], assignments: RecruiterAssignment[], requisitions: Requisition[], users: User[]): Record<string, BranchHead> {
  const want = new Set(codes);
  const reqsBy = new Map<string, Requisition[]>();
  for (const r of requisitions) {
    if (!want.has(r.branch_code)) continue;
    if (!reqsBy.has(r.branch_code)) reqsBy.set(r.branch_code, []);
    reqsBy.get(r.branch_code)!.push(r);
  }
  const rulesBy = new Map<string, RecruiterAssignment[]>();
  for (const a of assignments) {
    if (!want.has(a.branch_code)) continue;
    if (!rulesBy.has(a.branch_code)) rulesBy.set(a.branch_code, []);
    rulesBy.get(a.branch_code)!.push(a);
  }
  const branchBy = new Map(branches.map((b) => [b.branch_code, b]));
  const nameOf = new Map(users.map((u) => [normalizeEmail(u.email), u.name]));

  const out: Record<string, BranchHead> = {};
  for (const code of want) {
    const reqs = reqsBy.get(code) ?? [];
    const rules = rulesBy.get(code) ?? [];
    const owned: Record<string, number> = {};
    let open = 0;
    for (const r of reqs) {
      if (!NOT_CLOSED.includes(r.status)) continue;
      open++;
      const ta = normalizeEmail(r.ta_email);
      if (ta) owned[ta] = (owned[ta] ?? 0) + 1;
    }
    const taEmail = branchTaOf(code, rules, reqs);
    const only = rules.length === 1 && !rules[0].position_group.trim() ? normalizeEmail(rules[0].ta_email) : "";
    out[code] = { ...peopleOfBranch(branchBy.get(code)), taEmail, taName: taEmail ? nameOf.get(taEmail) || taEmail : "", open, owned, ruleOnlyFor: only, known: branchBy.has(code) };
  }
  return out;
}

/** What handing the branch to `taEmail` would do: how many positions move, and whether anything changes at all. */
export function handOverPreview(head: BranchHead, taEmail: string): { moving: number; changes: boolean } {
  const ta = normalizeEmail(taEmail);
  if (!ta) return { moving: 0, changes: false };
  const moving = head.open - (head.owned[ta] ?? 0);
  return { moving, changes: moving > 0 || head.ruleOnlyFor !== ta };
}
