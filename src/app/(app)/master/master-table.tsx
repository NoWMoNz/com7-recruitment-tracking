"use client";

import { useId, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { Dropdown } from "@/components/ui/dropdown";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatThaiDate } from "@/lib/domain/dates";
import type { MasterEntity } from "@/lib/domain/master";
import { cn } from "@/lib/utils";
import { Field, FIELD, FormError, useSubmit } from "../form-bits";
import { removeAssignment, saveMaster } from "./actions";

export type Cell = string | number | boolean | null;
export type Row = Record<string, Cell> & { _key: string };

export interface FieldDef {
  name: string;
  label: string;
  type: "text" | "email" | "number" | "date" | "select" | "checkbox";
  options?: { value: string; label: string }[];
  /** Key fields can't be changed once the row exists. */
  lockOnEdit?: boolean;
  required?: boolean;
  hint?: string;
  placeholder?: string;
}

export interface ColumnDef {
  key: string;
  label: string;
  format?: "date" | "bool" | "days";
  /** Show as secondary text under the first column instead of its own column. */
  sub?: boolean;
}

interface Props {
  entity: MasterEntity;
  noun: string;
  rows: Row[];
  columns: ColumnDef[];
  fields: FieldDef[];
  /** Default values for a new row. */
  blank: Record<string, string>;
  deletable?: boolean;
}

function show(v: Cell, format?: ColumnDef["format"]) {
  if (format === "date") return formatThaiDate((v as string) || null);
  if (format === "bool") return v ? "ใช้งาน" : "ปิด";
  if (format === "days") return v === null || v === "" ? "ค่าเริ่มต้น" : `${v} วัน`;
  return v === null || v === "" ? "-" : String(v);
}

function toForm(row: Row | null, blank: Record<string, string>, fields: FieldDef[]): Record<string, string> {
  if (!row) return { ...blank };
  return Object.fromEntries(fields.map((f) => [f.name, f.type === "checkbox" ? (row[f.name] ? "on" : "") : row[f.name] === null ? "" : String(row[f.name])]));
}

function EditForm({ entity, noun, fields, row, blank, onDone }: { entity: MasterEntity; noun: string; fields: FieldDef[]; row: Row | null; blank: Record<string, string>; onDone: () => void }) {
  const uid = useId();
  const [values, setValues] = useState(() => toForm(row, blank, fields));
  const { pending, errors, run, clear } = useSubmit(onDone);
  const set = (k: string, v: string) => {
    setValues((s) => ({ ...s, [k]: v }));
    clear(k);
  };

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveMaster(entity, row?._key ?? null, values), row ? `บันทึก${noun}แล้ว` : `เพิ่ม${noun}แล้ว`);
      }}
    >
      <FormError message={errors.form} />
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => {
          const id = `${uid}-${f.name}`;
          const locked = Boolean(row && f.lockOnEdit);
          const invalid = errors[f.name] ? { "aria-invalid": true as const, "aria-describedby": `${id}-err` } : {};
          if (f.type === "checkbox") {
            return (
              <label key={f.name} className="flex items-center gap-2 self-end pb-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={values[f.name] === "on"} onChange={(e) => set(f.name, e.target.checked ? "on" : "")} className="size-4 accent-[#2a8638]" />
                {f.label}
              </label>
            );
          }
          return (
            <Field key={f.name} id={id} label={f.label} error={errors[f.name]} hint={locked ? "แก้ไม่ได้ เพราะมีข้อมูลอื่นอ้างถึง" : f.hint}>
              {f.type === "select" ? (
                <Dropdown
                  id={id}
                  value={values[f.name] ?? ""}
                  onChange={(v) => set(f.name, v)}
                  options={f.options ?? []}
                  emptyLabel={f.required ? undefined : "—"}
                  placeholder="เลือก"
                  disabled={locked}
                  invalid={Boolean(errors[f.name])}
                  describedBy={errors[f.name] ? `${id}-err` : undefined}
                />
              ) : f.type === "date" ? (
                <DatePicker id={id} value={values[f.name] ?? ""} onChange={(v) => set(f.name, v)} clearable disabled={locked} invalid={Boolean(errors[f.name])} describedBy={errors[f.name] ? `${id}-err` : undefined} />
              ) : (
                <input
                  id={id}
                  type={f.type}
                  value={values[f.name] ?? ""}
                  onChange={(e) => set(f.name, e.target.value)}
                  className={cn(FIELD, locked && "bg-muted text-muted-foreground")}
                  readOnly={locked}
                  required={f.required}
                  placeholder={f.placeholder}
                  autoComplete="off"
                  {...invalid}
                />
              )}
            </Field>
          );
        })}
      </div>
      <DialogFooter>
        <button type="submit" disabled={pending} className="h-10 rounded-full bg-ink-chip px-6 text-sm font-medium text-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60">
          {pending ? "กำลังบันทึก…" : row ? "บันทึก" : `เพิ่ม${noun}`}
        </button>
      </DialogFooter>
    </form>
  );
}

function DeleteButton({ row, noun }: { row: Row; noun: string }) {
  const { pending, errors, run } = useSubmit(() => {});
  return (
    <span className="inline-flex items-center gap-2">
      {errors.form && <span className="text-xs text-destructive">{errors.form}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (window.confirm(`ลบ${noun}นี้?`)) run(() => removeAssignment(row._key), `ลบ${noun}แล้ว`);
        }}
        aria-label={`ลบ${noun}`}
        title={`ลบ${noun}`}
        className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
      >
        <Trash2 className="size-4" aria-hidden />
      </button>
    </span>
  );
}

export function MasterTable({ entity, noun, rows, columns, fields, blank, deletable }: Props) {
  const [editing, setEditing] = useState<{ row: Row | null } | null>(null);
  const [q, setQ] = useState("");
  const main = columns.filter((c) => !c.sub);
  const subs = columns.filter((c) => c.sub);
  const visible = q.trim() ? rows.filter((r) => Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(q.trim().toLowerCase()))) : rows;

  return (
    <section className="overflow-hidden rounded-3xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5">
      <header className="flex flex-wrap items-center gap-3 px-5 pt-4 pb-3">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`ค้นหา${noun}`} aria-label={`ค้นหา${noun}`} className={cn(FIELD, "rounded-full pl-10")} />
        </div>
        <span className="text-sm text-muted-foreground">{visible.length} รายการ</span>
        <button type="button" onClick={() => setEditing({ row: null })} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ink-chip px-4 text-sm font-medium text-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <Plus className="size-4" aria-hidden />
          เพิ่ม{noun}
        </button>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-y border-black/[0.06] bg-black/[0.025]">
              {main.map((c) => (
                <th key={c.key} className="px-5 py-2.5 font-medium whitespace-nowrap">
                  {c.label}
                </th>
              ))}
              <th className="px-5 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r._key} className="border-b border-black/[0.05] last:border-0 hover:bg-black/[0.015]">
                {main.map((c, i) => (
                  <td key={c.key} className="px-5 py-2.5 whitespace-nowrap">
                    <span className={cn(i === 0 && "font-medium", c.format === "bool" && !r[c.key] && "text-muted-foreground")}>{show(r[c.key], c.format)}</span>
                    {i === 0 && subs.length > 0 && <span className="block text-xs text-muted-foreground">{subs.map((s) => show(r[s.key], s.format)).filter((v) => v !== "-").join(" · ")}</span>}
                  </td>
                ))}
                <td className="px-5 py-2.5 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => setEditing({ row: r })}
                    aria-label={`แก้ไข ${String(r[main[0].key] ?? "")}`}
                    title="แก้ไข"
                    className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="size-4" aria-hidden />
                  </button>
                  {deletable && <DeleteButton row={r} noun={noun} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">ไม่พบข้อมูล</p>}
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-3xl p-6 [&::-webkit-scrollbar-track]:my-5 sm:max-w-xl">
          {editing && (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading text-xl font-medium">{editing.row ? `แก้ไข${noun}` : `เพิ่ม${noun}`}</DialogTitle>
                <DialogDescription>บันทึกลง Google Sheet ทันที (แท็บ {entity})</DialogDescription>
              </DialogHeader>
              <EditForm key={editing.row?._key ?? "new"} entity={entity} noun={noun} fields={fields} row={editing.row} blank={blank} onDone={() => setEditing(null)} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
