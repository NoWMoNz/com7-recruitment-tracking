"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TatBadge, TatResultText } from "@/components/aging-badge";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { formatThaiDate } from "@/lib/domain/dates";
import type { TrackingRow } from "@/lib/domain/tracking";
import { cn } from "@/lib/utils";

interface Props {
  rows: TrackingRow[];
  today: string;
  mineOnly: boolean;
  canFilterMine: boolean;
}

interface BranchGroup {
  key: string;
  region: string;
  branchName: string;
  branchCode: string;
  province: string;
  rows: TrackingRow[];
}

function groupByBranch(rows: TrackingRow[]): BranchGroup[] {
  const groups = new Map<string, BranchGroup>();
  for (const r of rows) {
    const key = `${r.region}|${r.branchCode}`;
    if (!groups.has(key)) {
      groups.set(key, { key, region: r.region, branchName: r.branchName, branchCode: r.branchCode, province: r.province, rows: [] });
    }
    groups.get(key)!.rows.push(r);
  }
  return [...groups.values()];
}

function matches(r: TrackingRow, q: string): boolean {
  if (!q) return true;
  const hay = `${r.branchName} ${r.branchCode} ${r.positionName} ${r.taName} ${r.province} ${r.offerName ?? ""}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

function Segmented({ value, options }: { value: string; options: { value: string; label: string; href: string }[] }) {
  return (
    <div className="inline-flex rounded-lg border bg-background p-0.5" role="group">
      {options.map((o) => (
        <Link
          key={o.value}
          href={o.href}
          aria-current={o.value === value ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm",
            o.value === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

function RequestDate({ row }: { row: TrackingRow }) {
  if (row.upcoming) {
    return (
      <span className="text-sm">
        {formatThaiDate(row.requestDate)}
        <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">ยังไม่ถึงวันว่าง</span>
      </span>
    );
  }
  return <span className="text-sm tabular-nums">{formatThaiDate(row.requestDate)}</span>;
}

export function TrackingView({ rows, mineOnly, canFilterMine }: Props) {
  const [region, setRegion] = useState("");
  const [q, setQ] = useState("");

  const regions = useMemo(() => [...new Set(rows.map((r) => r.region))], [rows]);
  const filtered = useMemo(
    () => rows.filter((r) => (!region || r.region === region) && matches(r, q.trim())),
    [rows, region, q],
  );
  const groups = useMemo(() => groupByBranch(filtered), [filtered]);
  const notMeet = filtered.filter((r) => r.tatResult === "NotMeet").length;
  const offered = filtered.filter((r) => r.status === "Offer").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {canFilterMine && (
          <Segmented
            value={mineOnly ? "1" : "0"}
            options={[
              { value: "1", label: "ของฉัน", href: "/tracking?mine=1" },
              { value: "0", label: "ทั้งหมด", href: "/tracking?mine=0" },
            ]}
          />
        )}
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          aria-label="กรองตามภาค"
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">ทุกภาค</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหาสาขา ตำแหน่ง หรือ TA"
          aria-label="ค้นหา"
          className="sm:max-w-xs"
        />
      </div>

      <dl className="grid grid-cols-3 gap-2 sm:max-w-md">
        <div className="rounded-lg border bg-background p-3">
          <dt className="text-xs text-muted-foreground">ตำแหน่ง</dt>
          <dd className="text-xl font-semibold tabular-nums">{filtered.length}</dd>
        </div>
        <div className="rounded-lg border bg-background p-3">
          <dt className="text-xs text-muted-foreground">Offer แล้ว</dt>
          <dd className="text-xl font-semibold tabular-nums">{offered}</dd>
        </div>
        <div className="rounded-lg border bg-background p-3">
          <dt className="text-xs text-muted-foreground">Not Meet</dt>
          <dd className="text-xl font-semibold tabular-nums text-[#b91c1c]">{notMeet}</dd>
        </div>
      </dl>

      {groups.length === 0 && (
        <p className="rounded-lg border bg-background py-12 text-center text-muted-foreground">ไม่มีตำแหน่งที่ตรงกับเงื่อนไข</p>
      )}

      <div className="space-y-4">
        {groups.map((g) => (
          <section key={g.key} className="overflow-hidden rounded-lg border bg-background">
            <header className="flex flex-wrap items-baseline justify-between gap-x-3 border-b bg-muted/40 px-4 py-2">
              <h2 className="font-medium">
                {g.branchName} <span className="text-sm font-normal text-muted-foreground">{g.branchCode}</span>
              </h2>
              <span className="text-xs text-muted-foreground">
                {g.region}
                {g.province ? ` · ${g.province}` : ""} · {g.rows.length} ตำแหน่ง
              </span>
            </header>

            {/* Desktop table */}
            <table className="hidden w-full text-left md:table">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-2 font-medium">ตำแหน่ง</th>
                  <th className="px-4 py-2 font-medium">วันที่แจ้งสรรหา</th>
                  <th className="px-4 py-2 font-medium">TAT</th>
                  <th className="px-4 py-2 font-medium">ผล TAT</th>
                  <th className="px-4 py-2 font-medium">สถานะ</th>
                  <th className="px-4 py-2 font-medium">TA</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="text-sm font-medium">{r.positionName}</div>
                      {r.offerName && (
                        <div className="text-xs text-muted-foreground">
                          {r.offerName} · Offer {formatThaiDate(r.offerDate)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <RequestDate row={r} />
                    </td>
                    <td className="px-4 py-2.5">
                      <TatBadge tat={r.tat} band={r.agingBand} />
                    </td>
                    <td className="px-4 py-2.5">
                      <TatResultText result={r.tatResult} />
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-2.5 text-sm">{r.taName || <span className="text-muted-foreground">ยังไม่มีเจ้าของ</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <ul className="divide-y md:hidden">
              {g.rows.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 space-y-1">
                    <div className="font-medium">{r.positionName}</div>
                    <div className="text-xs text-muted-foreground">
                      แจ้งสรรหา <RequestDate row={r} />
                    </div>
                    {r.offerName && (
                      <div className="text-xs text-muted-foreground">
                        {r.offerName} · Offer {formatThaiDate(r.offerDate)}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={r.status} />
                      <span className="text-xs text-muted-foreground">{r.taName || "ยังไม่มีเจ้าของ"}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <TatBadge tat={r.tat} band={r.agingBand} />
                    <TatResultText result={r.tatResult} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
