"use client";

import { Dropdown } from "@/components/ui/dropdown";
import type { PeopleFilter, PeopleOptions } from "@/lib/domain/people";

/** AM / RM / TA pill dropdowns for a filter bar. Values: AM and RM names, TA email. */
export function PeopleFilters({ idPrefix, value, onChange, options }: { idPrefix: string; value: PeopleFilter; onChange: (f: PeopleFilter) => void; options: PeopleOptions }) {
  const set = (k: keyof PeopleFilter) => (v: string) => onChange({ ...value, [k]: v || undefined });
  return (
    <>
      <label className="sr-only" htmlFor={`${idPrefix}-am`}>
        AM
      </label>
      <Dropdown id={`${idPrefix}-am`} variant="pill" value={value.am ?? ""} onChange={set("am")} emptyLabel="ทุก AM" options={options.ams.map((n) => ({ value: n, label: n }))} className="w-36" searchPlaceholder="ค้นหา AM…" />
      <label className="sr-only" htmlFor={`${idPrefix}-rm`}>
        RM
      </label>
      <Dropdown id={`${idPrefix}-rm`} variant="pill" value={value.rm ?? ""} onChange={set("rm")} emptyLabel="ทุก RM" options={options.rms.map((n) => ({ value: n, label: n }))} className="w-36" searchPlaceholder="ค้นหา RM…" />
      <label className="sr-only" htmlFor={`${idPrefix}-ta`}>
        TA
      </label>
      <Dropdown id={`${idPrefix}-ta`} variant="pill" value={value.ta ?? ""} onChange={set("ta")} emptyLabel="ทุก TA" options={options.tas} className="w-36" searchPlaceholder="ค้นหา TA…" />
    </>
  );
}

export const hasPeople = (f: PeopleFilter) => Boolean(f.am || f.rm || f.ta);
