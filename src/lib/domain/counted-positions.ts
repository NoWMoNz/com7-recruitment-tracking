/**
 * Positions HR lists in the quota report that are not recruited against the branch quota (dedicated brand staff
 * and vocational students). They are still shown with their own Quota / Actual, but they are left out of every
 * total, shortage and surplus, and the quota import opens no vacancies for them.
 */
export const UNCOUNTED_POSITIONS = ["PIA BTB Dedicate (1 ปี)", "PIA BTB Dedicate", "Bilateral Student (ทวิภาคี)"] as const;

const key = (name: string) => name.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
const UNCOUNTED = new Set(UNCOUNTED_POSITIONS.map(key));

/** False for a position in UNCOUNTED_POSITIONS (by name, ignoring case and spacing). */
export function isCountedPosition(positionName: string): boolean {
  return !UNCOUNTED.has(key(positionName));
}
