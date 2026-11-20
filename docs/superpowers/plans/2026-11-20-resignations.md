# รายชื่อลาออก และยกเลิกลาออก Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A page listing processed resignations, and a TA/admin action that withdraws one and handles its linked requisition.

**Architecture:** Three new columns on `Import_Resign` hold the withdrawal. A pure domain module (`resign.ts`) builds the list rows, filters them and plans a withdrawal; a thin runner (`lib/resign/withdraw.ts`, like `lib/processor/run.ts`) loads data, calls the plan and writes; a server action and a new page sit on top.

**Tech Stack:** Next.js App Router (read `node_modules/next/dist/docs/` before writing page code, per AGENTS.md), TypeScript, Vitest, `MemoryRepo` for tests, ExcelJS for export.

**Spec:** `docs/superpowers/specs/2026-11-20-resignations-design.md`

## Global Constraints

- Do not commit unless the user asks. Leave changes in the working tree.
- Thai UI copy; sentence case; same look as the other pages (glass cards, pill filters, `Dropdown`, `DateRangePicker`, `PageHeader`).
- `Import_Resign` rows have no id column: address them by sheet row number (`repo.listNumbered`, `repo.updateAt`) and re-check `employee_id` and `effective_date` before writing.
- Linked requisition = the one whose `source_ref` equals `RESIGN:<employee_id.trim()>:<effective_date>` (the ref `processor.ts` writes).
- Withdrawing a resignation whose requisition is `Vacancy` closes it as `Cancel` with **no approval and no evidence** (user decision). Every other open status goes to the review queue.
- Run `npx tsc --noEmit`, `npx eslint <changed files>` and `npx vitest run` before saying a task is done.

## Review Focus

- **Same employee, two resignations** (same `employee_id`, different dates): each row has its own requisition; withdrawing one must not touch the other. (Task 2)
- **Linked requisition missing** (not found, e.g. archived): record the withdrawal only, no error. (Task 2)
- **Double click / two TAs**: the second withdrawal returns "รายการนี้ยกเลิกลาออกไปแล้ว" and writes nothing. (Tasks 2, 3)
- **Stale row number** (sheet edited meanwhile, row now holds someone else): refuse, write nothing. (Task 3)
- **Version conflict on the requisition**: throw, and the import row must stay unmarked so the user can retry. (Task 3)

---

### Task 1: Data model — withdrawal columns and review type

**Files:**
- Modify: `src/lib/domain/types.ts` (`ImportResign`, `ReviewType`)
- Modify: `src/lib/sheets/schema.ts` (`Import_Resign` columns)
- Modify: `src/lib/repo/fixtures.ts` (3 `Import_Resign` rows), `tests/domain/processor.test.ts` (`resign()` helper)
- Modify: `src/app/(app)/process/process-view.tsx` (`REVIEW_LABEL`, `REVIEW_HINT`)
- Test: `tests/sheets/rows.test.ts`

**Interfaces:**
- Produces: `ImportResign` gains `cancelled_at: string`, `cancelled_by: string`, `cancel_note: string` (empty string = not withdrawn). `ReviewType` gains `"ResignWithdrawn"`.

- [ ] **Step 1: Write the failing test** in `tests/sheets/rows.test.ts`: `it("reads an Import_Resign row from an old sheet without the withdrawal columns", …)` — call `rowsToObjects(TABS.Import_Resign, [["employee_id","title","first_name","last_name","branch_code","position_code","effective_date","processed_at"], ["E1","นาย","ก","ข","BKK-012","SALES","20/11/2026","x"]])` and assert the row has `cancelled_at`, `cancelled_by`, `cancel_note` all `""` and no issues; plus `expect(TABS.Import_Resign.columns.map((c) => c.key).slice(-3)).toEqual(["cancelled_at","cancelled_by","cancel_note"])`.
- [ ] **Step 2: Run** `npx vitest run tests/sheets/rows.test.ts` — expect FAIL.
- [ ] **Step 3: Add the three string columns** to the type and, in `schema.ts`, after `processed_at` in `Import_Resign` (so `pnpm sheet:setup` can append them to an existing sheet). Add `"ResignWithdrawn"` to `ReviewType`.
- [ ] **Step 4: Fix the type errors this causes:** give the fixtures and the processor test helper the three fields as `""`; add `ResignWithdrawn` to both maps in `process-view.tsx` — label "ยกเลิกลาออกแต่ตำแหน่งยังเปิดอยู่", hint "ตัดสินใจกับตำแหน่งนี้ (เช่น คนที่ Offer ไว้) แล้วกดตรวจแล้ว".
- [ ] **Step 5: Verify:** `npx tsc --noEmit` clean, `npx vitest run` all pass.

---

### Task 2: Domain — list rows, filter, withdrawal plan

**Files:**
- Create: `src/lib/domain/resign.ts`
- Test: `tests/domain/resign.test.ts` (use `req`, `branch`, `user`, `offer`, `positions` from `tests/domain/helpers.ts`)

**Interfaces:**
- Consumes: `Numbered<T>` from `processor.ts`; `Plan<T>` from `offer.ts`; `inScope` from `permissions.ts`; `buOf` from `types.ts`; `formatThaiDate`, `normalizeEmail`.
- Produces:
  ```ts
  export type ResignState = "upcoming" | "resigned" | "withdrawn";
  export interface ResignRow {
    rowNumber: number; employeeId: string; name: string; bu: string; region: string; province: string;
    branchCode: string; branchName: string; positionName: string; effectiveDate: LocalDate;
    state: ResignState; cancelledAt: string; cancelledBy: string; cancelNote: string;
    reqId: string | null; reqStatus: Status | null; canWithdraw: boolean;
  }
  export interface ResignFilter { bu?: string; region?: string; state?: ResignState; from?: LocalDate; to?: LocalDate; q?: string }
  export type WithdrawOutcome = "cancelled" | "review" | "recorded";
  export const resignRef: (r: Pick<ImportResign, "employee_id" | "effective_date">) => string; // "RESIGN:E100:2026-11-20"
  export function buildResignRows(d: { resign: Numbered<ImportResign>[]; requisitions: Requisition[]; branches: Branch[]; positions: Position[]; users: User[] }, viewer: User, today: LocalDate): ResignRow[];
  export function filterResignRows(rows: ResignRow[], f: ResignFilter): ResignRow[];
  export function planWithdrawal(args: {
    row: ImportResign; branch: Branch | undefined; req: Requisition | null; offer: Offer | null;
    reviewRefs: ReadonlySet<string>; viewer: User; note: string; today: LocalDate;
    ids: { logId: string; reviewId: string }; now: Date;
  }): Plan<{ importPatch: Partial<ImportResign>; reqPatch: Partial<Requisition> | null; logEntry: StatusLogEntry | null; review: ReviewItem | null; outcome: WithdrawOutcome }>;
  ```

- [ ] **Step 1: Write failing tests** (names and the assertions that matter):
  - `buildResignRows` — "lists only processed rows the viewer may see, newest effective date first": rows with `processed_at === ""` are omitted; a TA scoped to `ภาคเหนือ` does not get a `ภาคกลาง` branch; `name` is `${title}${first_name} ${last_name}`; `bu` uses `buOf`.
  - "state: future effective date is upcoming, past is resigned, a row with `cancelled_at` is withdrawn (even if the date is future)".
  - "same employee with two dates keeps two rows, each linked to its own requisition by `source_ref`" (**Review Focus 1**) and "a row with no matching requisition has `reqId: null`" (**Focus 2**).
  - "`canWithdraw` is false for viewers, for out-of-scope TAs and for already-withdrawn rows; true for an in-scope TA and for super_admin".
  - `filterResignRows` — by `bu`, `region`, `state`, inclusive `from`/`to` on `effectiveDate`, and `q` matching name, employee id, branch or position (case-insensitive).
  - `planWithdrawal`:
    - Vacancy, request date in the past → `outcome: "cancelled"`, `reqPatch` `{ status: "Cancel", status_date: today, closed_at: today }`, `logEntry` from `Vacancy` to `Cancel`, `effective_date: today`, `ref_id: "RESIGN:E100:2026-11-20"`, note starting `ยกเลิกลาออก:`; `importPatch` has `cancelled_at: now.toISOString()`, `cancelled_by: viewer.email`, `cancel_note`.
    - Vacancy whose `request_date` is after `today` → the patch and log use `request_date` as the date, not `today`.
    - `Offer` with an `offer` → `outcome: "review"`, `reqPatch` and `logEntry` null, `review` has `type: "ResignWithdrawn"`, `ref: "RESIGNWD:RESIGN:E100:2026-11-20"`, `detail` containing the offered person's name; the same for `Hold`/`PendingCancel`/`PendingHold` without a name.
    - `reviewRefs` already holding that ref → `review: null`, outcome still `"review"`.
    - `Hired`/`Cancel`/`Transfer` or `req: null` → `outcome: "recorded"`, only `importPatch`.
    - errors: viewer role `viewer` → `errors.form`; TA out of scope → `errors.form`; `cancelled_at` already set → `errors.form` "รายการนี้ยกเลิกลาออกไปแล้ว" (**Focus 3**); blank `note` → `errors.note`; unprocessed row → `errors.form`.
- [ ] **Step 2: Run** `npx vitest run tests/domain/resign.test.ts` — expect FAIL (module missing).
- [ ] **Step 3: Implement** `resign.ts` per the interfaces. `reqStatus`/`reqId` come from the requisition whose `source_ref === resignRef(row)`. Row order: `effectiveDate` descending, then `employeeId`. Scope check: `inScope(viewer, branch ?? { region: "ไม่ระบุ", branch_code })` as in `queues.ts`. `canWithdraw` = role `ta` or `super_admin`, in scope, not withdrawn.
- [ ] **Step 4: Run** the test file — expect PASS; then `npx tsc --noEmit`.

---

### Task 3: Runner — load, plan, write

**Files:**
- Create: `src/lib/resign/withdraw.ts`
- Test: `tests/resign/withdraw.test.ts` (model it on `tests/processor/run.test.ts`: `MemoryRepo` with a small dataset)

**Interfaces:**
- Consumes: `planWithdrawal`, `resignRef` (Task 2); `Repo` (`getFresh`, `update`, `append`, `updateAt`, `listNumbered`, `list`).
- Produces:
  ```ts
  export async function runWithdrawal(
    repo: Repo, viewer: User,
    input: { rowNumber: number; employeeId: string; effectiveDate: LocalDate; note: string },
    opts?: { now?: Date; today?: LocalDate },
  ): Promise<Plan<{ outcome: WithdrawOutcome }>>;
  ```
  Expected exceptions (`ConflictError`, `NotFoundError`) propagate; the caller maps them.

- [ ] **Step 1: Write failing tests:**
  - "Vacancy: requisition becomes Cancel, a StatusLog row is added, the import row gets `cancelled_*`, `outcome: 'cancelled'`".
  - "Offer: requisition untouched, one `ResignWithdrawn` ReviewQueue row, import row marked; running again returns the already-withdrawn error and adds nothing" (**Focus 3**).
  - "stale row number: `rowNumber` points at a row with a different `employee_id` → `ok: false`, nothing written" (**Focus 4**).
  - "version conflict: requisition bumped after the runner read it (use a repo whose `update` throws `ConflictError`, or change the version between reads) → rejects with `ConflictError` and the import row is still unmarked" (**Focus 5**).
- [ ] **Step 2: Run** `npx vitest run tests/resign` — expect FAIL.
- [ ] **Step 3: Implement `runWithdrawal`.** Read `Import_Resign` via `listNumbered`, find `rowNumber`, refuse (`errors.form` "ไม่พบรายการลาออกนี้แล้ว กรุณาโหลดใหม่") unless `employee_id` and `effective_date` match the input. Read branch, requisitions (find by `source_ref`, then `getFresh` for its current `version`), the `Offer` when `offer_id` is set, `ReviewQueue` refs. Call `planWithdrawal`; on `ok` write in this order: `repo.update("Requisitions", id, reqPatch, req.version)`, `repo.append("StatusLog", [logEntry])`, `repo.append("ReviewQueue", [review])`, then **last** `repo.updateAt("Import_Resign", [{ rowNumber, patch: importPatch }])` — so a failure earlier leaves the row unmarked and the action retryable. Generate ids as `lib/processor/run.ts` does.
- [ ] **Step 4: Run** the tests — expect PASS; `npx tsc --noEmit`.

---

### Task 4: Page, action, menu and export

**Files:**
- Create: `src/app/(app)/resignations/page.tsx`, `resignations-view.tsx`, `actions.ts`
- Create: `src/app/api/export/resignations/route.ts`
- Modify: `src/lib/report/excel.ts` (add `buildResignationsWorkbook`), `src/components/sidebar-nav.tsx`
- Test: `tests/report/resignations-excel.test.ts`

**Interfaces:**
- Consumes: `buildResignRows`, `filterResignRows`, `ResignFilter` (Task 2); `runWithdrawal` (Task 3); `writeError`, `fail` from `action-utils.ts`; `getSessionUser`.
- Produces:
  ```ts
  // actions.ts ("use server")
  export async function withdrawResignation(input: { rowNumber: number; employeeId: string; effectiveDate: string; note: string }): Promise<ActionResult>;
  // excel.ts
  export async function buildResignationsWorkbook(rows: ResignRow[]): Promise<{ buffer: ArrayBuffer; filename: string }>; // recruitment-resignations.xlsx, one sheet "รายชื่อลาออก"
  ```

- [ ] **Step 1: Write the failing export test:** `buildResignationsWorkbook` on two `ResignRow`s produces a sheet with a header row (รหัสพนักงาน, ชื่อ, BU, ภาค, สาขา, ตำแหน่ง, วันที่มีผล, สถานะ, สถานะตำแหน่ง, ยกเลิกเมื่อ, เหตุผล) and one line per row (read the buffer back with ExcelJS).
- [ ] **Step 2: Run** it — expect FAIL; implement `buildResignationsWorkbook` in `excel.ts`, reusing the title/header styling of `buildWorkbook`; run — expect PASS.
- [ ] **Step 3: Server action.** `withdrawResignation` calls `runWithdrawal(getRepo(), await getSessionUser(), input)`, maps `ConflictError`/`NotFoundError` through `writeError`, returns `{ ok: true }` or the plan's `errors`.
- [ ] **Step 4: Page.** `/resignations` is a server `page.tsx` (Suspense fallback like `hold/page.tsx`) that loads `Import_Resign` (`listNumbered`), Requisitions, Branches, Positions, Users and passes `buildResignRows(...)` to a client `ResignationsView`. The view has: `PageHeader` "รายชื่อลาออก"; filter bar with BU, ภาค, สถานะ (ทั้งหมด / รอถึงวันมีผล / ลาออกแล้ว / ยกเลิกลาออก) dropdowns, `DateRangePicker` on วันที่มีผล with `allowAll` (default: all), search box, "ล้างตัวกรอง", and Export Excel (link to `/api/export/resignations` with the same filters as query params `bu, region, state, from, to, q`); a table (name + employee id, BU/สาขา, ตำแหน่ง, วันที่มีผล, state chip, linked-requisition status chip, action). Rows with `canWithdraw` show "ยกเลิกลาออก", which opens a `Dialog` with a required reason textarea, and shows a plain sentence of what will happen (Vacancy → ปิดตำแหน่งให้อัตโนมัติ; Offer/Hold/Pending → ส่งให้ผู้ดูแลตรวจ; otherwise → บันทึกอย่างเดียว) taken from `reqStatus`. Success: `toast` and `router.refresh()`; errors from the action shown under the field (`errors.note`) or in the dialog (`errors.form`). Withdrawn rows show who, when and why.
- [ ] **Step 5: Export route.** `GET /api/export/resignations` authenticates as `api/export/route.ts` does, loads the same data, applies `filterResignRows` with the query params, returns the workbook (same headers).
- [ ] **Step 6: Menu.** Add `{ href: "/resignations", label: "รายชื่อลาออก", icon: UserMinus }` after Hold in `ITEMS` in `sidebar-nav.tsx` (visible to every role).
- [ ] **Step 7: Verify.** `npx tsc --noEmit`, `npx eslint` on the changed files, `npx vitest run` all pass. Then run the app with `DATA_SOURCE=memory`, sign in with the dev login as the demo super_admin, run "ประมวลผล" on the Process page (it creates two resignation requisitions from the sample rows), open `/resignations`, withdraw one, and confirm the linked requisition shows as Cancel on the tracking page. If the app cannot be run here, say so instead of claiming it works.

---

## Self-review notes

- Spec coverage: list + filters + export (Task 4), withdrawal columns and who/when (Tasks 1, 3), the four requisition cases (Task 2 plan, Task 3 writes), double-withdraw guard (Tasks 2, 3), permissions (Task 2). Non-goals (manual entry, undo, Quota dashboard) have no task.
- Builder's call from the spec: `PendingCancel`/`PendingHold`/`Hold` go to the review queue like `Offer` — implemented in Task 2.
