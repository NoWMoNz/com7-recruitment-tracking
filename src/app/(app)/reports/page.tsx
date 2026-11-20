import { Suspense, type ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session-user";
import { formatThaiDate } from "@/lib/domain/dates";
import { periodText, type GroupStat, type MonthlyRow } from "@/lib/domain/report";
import { loadReport, parseReportParams, type ReportResult, type ReportTab } from "@/lib/report/load";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "@/components/status-badge";
import type { Status } from "@/lib/domain/types";
import { RecomputeButton, ReportFilters } from "./report-controls";
import { reportQuery } from "./report-href";

const TITLE = "Reports";
const DESCRIPTION = "สรุปราย TA, Hired และ Turndown ตามช่วงวันที่ที่เลือก และประวัติของแต่ละตำแหน่ง export เป็น Excel ได้ทุกตาราง";

const TABS: { tab: ReportTab; label: string }[] = [
  { tab: "monthly", label: "สรุปราย TA" },
  { tab: "weekly", label: "Hired" },
  { tab: "turndowns", label: "Turndown" },
  { tab: "history", label: "ประวัติตำแหน่ง" },
];

const CARD = "overflow-hidden rounded-3xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5";
const TH = "px-4 py-2.5 font-medium whitespace-nowrap";
const TD = "px-4 py-2.5 whitespace-nowrap";

function Table({ head, children, numericFrom = 1 }: { head: string[]; children: ReactNode; numericFrom?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b border-black/[0.06] bg-black/[0.025]">
            {head.map((h, i) => (
              <th key={h} className={cn(TH, i >= numericFrom && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_tr]:border-b [&_tr]:border-black/[0.05] [&_tr:last-child]:border-0">{children}</tbody>
      </table>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-muted-foreground">{children}</p>;
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");

function Monthly({ r }: { r: ReportResult }) {
  const m = r.monthly;
  const line = (x: MonthlyRow, total = false) => (
    <tr key={x.taEmail || x.taName} className={cn(total && "bg-black/[0.025] font-medium")}>
      <td className={TD}>
        {x.taName}
        {!total && <span className="block text-xs text-muted-foreground">{x.region}</span>}
      </td>
      {[x.carriedIn, x.new, x.total, x.closed, x.cancel, x.hold, x.offerPending, x.remaining].map((v, i) => (
        <td key={i} className={cn(TD, "text-right tabular-nums")}>
          {v}
        </td>
      ))}
      <td className={cn(TD, "text-right tabular-nums")}>
        {pct(x.tatMeet, x.tatTotal)}
        <span className="block text-xs text-muted-foreground">
          {x.tatMeet}/{x.tatTotal}
        </span>
      </td>
    </tr>
  );
  return (
    <section className={CARD}>
      <header className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-3">
        <h2 className="font-heading font-medium">{periodText(r.params.range)}</h2>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {m.source.kind === "snapshot" ? (
            <span className="rounded-full bg-accent px-2.5 py-1 text-accent-foreground">ปิดงวดแล้ว ({new Date(m.source.computedAt).toLocaleDateString("en-GB", { timeZone: "Asia/Bangkok" })})</span>
          ) : (
            <span className="rounded-full bg-muted px-2.5 py-1">คำนวณจากข้อมูลปัจจุบัน</span>
          )}
          {m.canRecompute && m.month && <RecomputeButton month={m.month} />}
        </div>
      </header>
      {m.rows.length === 0 ? (
        <Empty>ไม่มีข้อมูลในช่วงนี้ตามตัวกรอง</Empty>
      ) : (
        <Table head={["TA", "ยกมา", "เข้าใหม่", "ถือทั้งหมด", "ปิดได้", "Cancel", "Hold", "Offer ค้าง", "คงเหลือ", "TAT Meet"]}>
          {m.rows.map((x) => line(x))}
          {line({ ...m.total, taName: "รวม" }, true)}
        </Table>
      )}
      <p className="border-t border-black/[0.05] px-5 py-3 text-xs text-muted-foreground">
        ยกมา = ตำแหน่งที่เปิดอยู่ ณ วันก่อนวันแรกของช่วง · ปิดได้ = Hired + รับโอน · คงเหลือ และ Offer ค้าง นับ ณ วันสุดท้ายของช่วง (หรือวันนี้ถ้ายังมาไม่ถึง) · TAT Meet นับจาก Offer ที่เกิดในช่วง · เครดิตให้ TA เจ้าของปัจจุบันของตำแหน่ง
      </p>
    </section>
  );
}

function Groups({ title, groups }: { title: string; groups: GroupStat[] }) {
  return (
    <section className={CARD}>
      <h3 className="px-5 pt-4 pb-2 font-heading text-sm font-medium">{title}</h3>
      {groups.length === 0 ? (
        <Empty>–</Empty>
      ) : (
        <Table head={["", "Hired", "TAT เฉลี่ย", "Meet"]}>
          {groups.map((g) => (
            <tr key={g.key}>
              <td className={TD}>{g.key}</td>
              <td className={cn(TD, "text-right tabular-nums")}>{g.hired}</td>
              <td className={cn(TD, "text-right tabular-nums")}>{g.avgTat} วัน</td>
              <td className={cn(TD, "text-right tabular-nums")}>{g.meetPct}%</td>
            </tr>
          ))}
        </Table>
      )}
    </section>
  );
}

function Weekly({ r }: { r: ReportResult }) {
  const w = r.weekly;
  return (
    <div className="space-y-4">
      <section className={CARD}>
        <header className="px-5 pt-4 pb-3">
          <h2 className="font-heading font-medium">
            Hired {periodText(r.params.range)} <span className="font-sans text-sm font-normal text-muted-foreground">{w.hires.length} คน</span>
          </h2>
        </header>
        {w.hires.length === 0 ? (
          <Empty>ไม่มีคนที่เปลี่ยนเป็น Hired ในช่วงเวลานี้</Empty>
        ) : (
          <Table head={["วันที่ Hired", "ชื่อ", "สาขา / ตำแหน่ง", "TA", "Channel", "TAT"]} numericFrom={5}>
            {w.hires.map((h) => (
              <tr key={`${h.employeeId}-${h.hiredAt}`}>
                <td className={cn(TD, "tabular-nums")}>{formatThaiDate(h.hiredAt)}</td>
                <td className={TD}>
                  {h.name}
                  <span className="block text-xs text-muted-foreground">รหัส {h.employeeId} · เริ่มงาน {formatThaiDate(h.startDate)}</span>
                </td>
                <td className={TD}>
                  {h.positionName}
                  <span className="block text-xs text-muted-foreground">
                    {h.branchName} · {h.region}
                  </span>
                </td>
                <td className={TD}>{h.taName}</td>
                <td className={TD}>{h.channel}</td>
                <td className={cn(TD, "text-right tabular-nums")}>
                  {h.tat} วัน
                  <span className={cn("block text-xs", h.meet ? "text-[#15803d]" : "text-[#b91c1c]")}>{h.meet ? "Meet" : "Not Meet"}</span>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Groups title="แยกตาม TA" groups={w.groups.taName} />
        <Groups title="แยกตามภาค" groups={w.groups.region} />
        <Groups title="แยกตามตำแหน่ง" groups={w.groups.positionName} />
        <Groups title="แยกตาม Sourcing Channel" groups={w.groups.channel} />
      </div>
    </div>
  );
}

function Turndowns({ r }: { r: ReportResult }) {
  const t = r.turndowns;
  return (
    <section className={CARD}>
      <header className="px-5 pt-4 pb-3">
        <h2 className="font-heading font-medium">
          Turndown {periodText(r.params.range)} <span className="font-sans text-sm font-normal text-muted-foreground">{t.rows.length} รายการ</span>
        </h2>
      </header>
      {t.rows.length === 0 ? (
        <Empty>ไม่มี Turndown ในช่วงเวลานี้</Empty>
      ) : (
        <Table head={["วันที่", "ชื่อ", "สาขา / ตำแหน่ง", "TA", "Offer เมื่อ", "Channel", "เหตุผล"]} numericFrom={99}>
          {t.rows.map((x, i) => (
            <tr key={i}>
              <td className={cn(TD, "tabular-nums")}>{formatThaiDate(x.date)}</td>
              <td className={TD}>{x.name}</td>
              <td className={TD}>
                {x.positionName}
                <span className="block text-xs text-muted-foreground">{x.branchName}</span>
              </td>
              <td className={TD}>{x.taName}</td>
              <td className={cn(TD, "tabular-nums")}>
                {formatThaiDate(x.offerDate)}
                <span className="block text-xs text-muted-foreground">ก่อน Turndown {x.daysAfterOffer} วัน</span>
              </td>
              <td className={TD}>{x.channel}</td>
              <td className="max-w-80 px-4 py-2.5">{x.reason}</td>
            </tr>
          ))}
        </Table>
      )}
    </section>
  );
}

const statusLabel = (s: string) => STATUS_LABEL[s as Status] ?? (s || "สร้าง");
/** Log rows that record an edit rather than a status change. */
const EDIT_LABEL: Record<string, string> = { OwnerChange: "เปลี่ยน TA เจ้าของ", RequestDateChange: "แก้วันที่แจ้งสรรหา" };

function History({ r }: { r: ReportResult }) {
  const h = r.history;
  return (
    <section className={CARD}>
      <header className="px-5 pt-4 pb-3">
        <h2 className="font-heading font-medium">ประวัติการเปลี่ยนสถานะ</h2>
        <p className="text-xs text-muted-foreground">เรียงจากตำแหน่งที่มีความเคลื่อนไหวล่าสุด ใช้ตัวกรองด้านบนเพื่อหาตำแหน่งที่ต้องการ{h.truncated && " (แสดง 60 ตำแหน่งแรก)"}</p>
      </header>
      {h.items.length === 0 ? (
        <Empty>ไม่พบตำแหน่งตามตัวกรอง</Empty>
      ) : (
        <ul className="divide-y divide-black/[0.06] border-t border-black/[0.06]">
          {h.items.map((i) => (
            <li key={i.id}>
              <details className="group px-5 py-3">
                <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                  <span>
                    <span className="font-medium">{i.title}</span>
                    <span className="block text-xs text-muted-foreground">{i.subtitle}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {statusLabel(i.status)} · {i.entries.length} เหตุการณ์ <span className="group-open:hidden">▾</span>
                    <span className="hidden group-open:inline">▴</span>
                  </span>
                </summary>
                {i.entries.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">ยังไม่มีการเปลี่ยนสถานะ</p>
                ) : (
                  <ol className="mt-3 space-y-2 border-l border-border pl-4">
                    {i.entries.map((e, k) => (
                      <li key={k} className="text-sm">
                        <span className="tabular-nums text-muted-foreground">{formatThaiDate(e.date)}</span>{" "}
                        <b className="font-medium">{EDIT_LABEL[e.to] ?? `${statusLabel(e.from)} → ${statusLabel(e.to)}`}</b>{" "}
                        <span className="text-muted-foreground">โดย {e.actor}</span>
                        {e.note && <span className="block text-xs text-foreground/70">{e.note}</span>}
                      </li>
                    ))}
                  </ol>
                )}
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function ReportsContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [user, sp] = await Promise.all([getSessionUser(), searchParams]);
  const params = parseReportParams(sp);
  const r = await loadReport(user, params);
  // Range in force as plain URL values, so the picker shows it and every link and the export keep it.
  const { range } = params;
  const flat: Record<string, string | undefined> = {
    tab: params.tab,
    bu: params.bu,
    region: params.region,
    province: params.province,
    branch: params.branch,
    position: params.position,
    ta: params.ta,
    all: range.all ? "1" : undefined,
    from: range.all ? undefined : range.first,
    to: range.all ? undefined : range.last,
  };

  return (
    <div className="space-y-4">
      <nav aria-label="ประเภทรายงาน" className="flex flex-wrap gap-1 rounded-full bg-muted p-1 sm:w-fit">
        {TABS.map((t) => (
          <Link
            key={t.tab}
            href={`/reports?${reportQuery(flat, { tab: t.tab })}`}
            aria-current={params.tab === t.tab ? "page" : undefined}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              params.tab === t.tab ? "bg-white font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <ReportFilters params={flat} options={r.options} />
      {params.tab === "monthly" && <Monthly r={r} />}
      {params.tab === "weekly" && <Weekly r={r} />}
      {params.tab === "turndowns" && <Turndowns r={r} />}
      {params.tab === "history" && <History r={r} />}
    </div>
  );
}

export default function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <div className="space-y-4">
      <PageHeader title={TITLE} description={DESCRIPTION} />
      <Suspense fallback={<p className="py-12 text-center text-muted-foreground">กำลังโหลดรายงาน…</p>}>
        <ReportsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
