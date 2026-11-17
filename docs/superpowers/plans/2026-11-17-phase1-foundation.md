# Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Next.js app that logs a user in, reads requisitions from Google Sheets (or an in-memory dev store), and shows a read-only Tracking page with correct TAT, Meet/Not Meet and aging colours.

**Architecture:** Pure domain logic in `src/lib/domain` (dates, TAT, aging, permissions, tracking view) with unit tests. A `Repo` interface in `src/lib/repo` has two implementations: `SheetsRepo` (Google Sheets API, rows located by `id` column, optimistic `version` check, 60 s tagged cache) and `MemoryRepo` (fixtures, used by tests and by local dev before Google credentials exist). Server Components read through the repo; Auth.js guards every page.

**Tech Stack:** Next.js (App Router, latest from create-next-app) + TypeScript + Tailwind + shadcn/ui, pnpm, Vitest, `googleapis`, `next-auth` v5 (Auth.js, JWT sessions), `tsx` for scripts.

**Spec:** `docs/superpowers/specs/2026-11-17-recruitment-tracking-design.md` (sections 5, 6, 8, 9, 10, 11.2 are the ones this phase implements)

## Global Constraints

- Timezone **Asia/Bangkok** for every "today"; UI dates **dd/mm/yyyy (ค.ศ.)**.
- Internal date type is `LocalDate` = string `"YYYY-MM-DD"`; never pass JS `Date` across module boundaries.
- Dates are stored in Sheets as **serial numbers** (days since 1899-12-30) in columns formatted `dd/mm/yyyy`; written with `valueInputOption: "RAW"`, read with `valueRenderOption: "UNFORMATTED_VALUE"`.
- Never address a Sheet row by a remembered row number — always locate by the `id` column read fresh at write time.
- Defaults: `default_sla_days = 30`, aging bands `30 / 60 / 90`, `backdate_days = 3`.
- Aging colours: 0–30 green, 31–60 orange, 61–90 red, 90+ dark red.
- On-process statuses: `Vacancy`, `Offer`, `PendingCancel`, `PendingHold`.
- UI copy in Thai; layout must work at 375 px width (cards instead of table on mobile).
- `DATA_SOURCE=memory` must let the whole app run locally with no Google credentials.
- Dev-only login (`AUTH_DEV_LOGIN=1`) must be impossible in production (`NODE_ENV === "production"` disables it).
- Commit after every task.

## Review Focus

1. **Server clock is UTC on Vercel.** At 2026-11-17T18:30Z it is already 18/11 in Bangkok; TAT and aging must use the Bangkok date. → test in Task 2.
2. **Ju sorts, inserts or deletes rows in the Sheet.** An update must still hit the row whose `id` matches, even with blank rows in between. → test in Task 5.
3. **Messy cells pasted by humans:** fully blank rows, text in a date column, Buddhist-era years (`17/11/2569`), stray spaces. Blank rows are skipped; BE years convert; unparseable dates become `null` with an error, not a crash. → tests in Tasks 2 and 5.
4. **Upcoming vacancy (request date in the future, from a resign effective later).** TAT and aging are 0, not negative, and the row is flagged `upcoming`. → test in Task 3.
5. **Allowlist email mismatch** (`Ju@Com7.co.th ` in Sheet vs `ju@com7.co.th` from Google). Must match case- and whitespace-insensitively; inactive users are rejected. → test in Task 7.

---

## File Structure

```
src/
  lib/
    domain/
      types.ts          Status, Role, LocalDate, row types for every tab
      dates.ts          Bangkok today, day diff, dd/mm/yyyy parse/format, serial <-> LocalDate
      settings.ts       parseSettings(rows) -> AppSettings
      tat.ts            holdDays, computeTat, tatResult, agingDays, agingBand
      permissions.ts    normalizeEmail, findActiveUser, inScope, canEditRequisition
      tracking.ts       buildTrackingRows(...) -> TrackingRow[]
    sheets/
      schema.ts         TABS: tab name + ordered column specs (single source of truth)
      rows.ts           rowsToObjects / objectToRow / findRowNumberById
      client.ts         googleapis Sheets client from env
    repo/
      types.ts          Repo interface, ConflictError
      memory-repo.ts    MemoryRepo
      sheets-repo.ts    SheetsRepo (cache, id lookup, version check)
      fixtures.ts       dev/test dataset (today = 2026-11-17)
      index.ts          getRepo(): picks by DATA_SOURCE
  auth.ts               Auth.js config (Google + dev credentials), allowlist check
  proxy.ts              route guard (named middleware.ts if installed Next < 16)
  app/
    layout.tsx          Thai font, shell
    login/page.tsx      sign-in page
    (app)/layout.tsx    nav + session user
    (app)/tracking/page.tsx
    (app)/tracking/tracking-view.tsx   client component: filter + table/cards
    page.tsx            redirect to /tracking
scripts/
  setup-sheet.ts        create tabs, headers, formats, warning-only protection
  seed-sheet.ts         write fixtures into a TEST sheet
tests/  (mirrors src/lib/**)
.env.example
README.md
```

---

### Task 1: Project scaffold

**Files:**
- Create: project via create-next-app in `com7-recruitment-status/` (the folder already contains `docs/`), `vitest.config.ts`, `tests/smoke.test.ts`, `.env.example`, `.gitignore` additions

**Interfaces:**
- Produces: `pnpm test`, `pnpm build`, `pnpm lint`, path alias `@/` → `src/`

- [ ] **Step 1:** `git init` in `com7-recruitment-status/`, then run `pnpm create next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm` (keep `docs/`; answer "yes" to proceeding in a non-empty dir).
- [ ] **Step 2:** `pnpm add googleapis next-auth@beta` and `pnpm add -D vitest @vitest/coverage-v8 tsx vite-tsconfig-paths`; `pnpm dlx shadcn@latest init` (neutral base colour), then `pnpm dlx shadcn@latest add button badge card table select input dialog dropdown-menu sonner`.
- [ ] **Step 3:** `vitest.config.ts` with `tsconfigPaths()` plugin, `environment: "node"`, `include: ["tests/**/*.test.ts"]`; add `"test": "vitest run"` to `package.json`.
- [ ] **Step 4:** Write `tests/smoke.test.ts`: `expect(1 + 1).toBe(2)`. Run `pnpm test` → 1 passed.
- [ ] **Step 5:** Write `.env.example`:
  ```
  DATA_SOURCE=memory            # memory | sheets
  SHEET_ID=
  GOOGLE_SERVICE_ACCOUNT_EMAIL=
  GOOGLE_PRIVATE_KEY=
  AUTH_SECRET=
  AUTH_GOOGLE_ID=
  AUTH_GOOGLE_SECRET=
  AUTH_DEV_LOGIN=1              # dev only; ignored in production
  ```
  Ensure `.env*` except `.env.example` is git-ignored.
- [ ] **Step 6:** `pnpm build` → succeeds.
- [ ] **Step 7:** Commit `chore: scaffold Next.js app with Vitest and shadcn`.

---

### Task 2: Date utilities

**Files:**
- Create: `src/lib/domain/types.ts` (only `LocalDate` for now), `src/lib/domain/dates.ts`
- Test: `tests/domain/dates.test.ts`

**Interfaces:**
- Produces:
  - `type LocalDate = string` (`"YYYY-MM-DD"`)
  - `todayBangkok(now?: Date): LocalDate`
  - `daysBetween(from: LocalDate, to: LocalDate): number` (to − from, may be negative)
  - `formatThaiDate(d: LocalDate | null): string` → `"dd/mm/yyyy"` or `"-"`
  - `parseUserDate(input: string): LocalDate | null` — accepts `dd/mm/yyyy`, `d/m/yyyy`, `yyyy-mm-dd`; year > 2400 is BE → minus 543; invalid calendar dates → `null`
  - `serialToLocalDate(serial: number): LocalDate`, `localDateToSerial(d: LocalDate): number`
  - `addDays(d: LocalDate, n: number): LocalDate`

- [ ] **Step 1: Write failing tests**
  ```ts
  test("today uses Bangkok, not UTC", () => {
    expect(todayBangkok(new Date("2026-11-17T18:30:00Z"))).toBe("2026-11-18");
    expect(todayBangkok(new Date("2026-11-17T16:59:00Z"))).toBe("2026-11-17");
  });
  test("daysBetween", () => {
    expect(daysBetween("2026-10-02", "2026-11-17")).toBe(46);
    expect(daysBetween("2026-11-17", "2026-11-17")).toBe(0);
    expect(daysBetween("2026-11-20", "2026-11-17")).toBe(-3);
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
  });
  test("formatThaiDate", () => {
    expect(formatThaiDate("2026-11-07")).toBe("07/11/2026");
    expect(formatThaiDate(null)).toBe("-");
  });
  test("parseUserDate", () => {
    expect(parseUserDate("17/11/2026")).toBe("2026-11-17");
    expect(parseUserDate("7/1/2026")).toBe("2026-01-07");
    expect(parseUserDate("17/11/2569")).toBe("2026-11-17");
    expect(parseUserDate("2026-11-17")).toBe("2026-11-17");
    expect(parseUserDate(" 17/11/2026 ")).toBe("2026-11-17");
    expect(parseUserDate("31/02/2026")).toBeNull();
    expect(parseUserDate("ไม่ทราบ")).toBeNull();
    expect(parseUserDate("")).toBeNull();
  });
  test("sheet serial round trip", () => {
    expect(localDateToSerial("2026-11-17")).toBe(46343);
    expect(serialToLocalDate(46343)).toBe("2026-11-17");
    expect(serialToLocalDate(46343.75)).toBe("2026-11-17"); // time part ignored
  });
  test("addDays", () => {
    expect(addDays("2026-11-17", -3)).toBe("2026-11-14");
  });
  ```
- [ ] **Step 2:** `pnpm test tests/domain/dates.test.ts` → FAIL (module not found).
- [ ] **Step 3:** Implement in `src/lib/domain/dates.ts`. Use UTC arithmetic on `Date.UTC(y, m-1, d)` for all day math; `todayBangkok` = `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" })`. Serial epoch = `Date.UTC(1899, 11, 30)`.
- [ ] **Step 4:** Run tests → PASS.
- [ ] **Step 5:** Commit `feat(domain): Bangkok date utilities`.

---

### Task 3: Domain types, settings, TAT and aging

**Files:**
- Modify: `src/lib/domain/types.ts`
- Create: `src/lib/domain/settings.ts`, `src/lib/domain/tat.ts`
- Test: `tests/domain/settings.test.ts`, `tests/domain/tat.test.ts`

**Interfaces:**
- Consumes: `LocalDate`, `daysBetween` (Task 2)
- Produces (in `types.ts`):
  ```ts
  type Status = "Vacancy" | "Offer" | "PendingCancel" | "PendingHold" | "Hold" | "Cancel" | "Hired" | "Transfer";
  const ON_PROCESS: Status[] = ["Vacancy", "Offer", "PendingCancel", "PendingHold"];
  type Role = "super_admin" | "ta" | "viewer";
  interface Requisition { id: string; branch_code: string; position_code: string; request_date: LocalDate;
    source: string; source_ref: string; ta_email: string; status: Status; status_date: LocalDate | null;
    offer_id: string; closed_at: LocalDate | null; version: number; created_at: string; updated_at: string }
  interface Offer { id; req_id; title; first_name; last_name; phone; offer_date: LocalDate; sourcing_channel;
    tat_at_offer: number; ta_email; created_by; created_at }
  interface StatusLogEntry { id; req_id; from_status: string; to_status: string; effective_date: LocalDate;
    actor; at: string; note; ref_id }
  interface Branch { branch_code; branch_name; brand; province; region; status: "Open" | "Closed" | "Project";
    open_date: LocalDate | null; close_date: LocalDate | null }
  interface Position { position_code; position_name; position_group; sla_days: number | null }
  interface User { email; name; role: Role; scope: string; active: boolean }
  interface SettingRow { key: string; value: string }
  ```
  (all unlisted field types are `string`)
- Produces (`settings.ts`): `interface AppSettings { defaultSlaDays: number; agingBands: [number, number, number]; backdateDays: number }`, `parseSettings(rows: SettingRow[]): AppSettings`, `slaFor(position: Position | undefined, s: AppSettings): number`
- Produces (`tat.ts`):
  - `holdDays(log: StatusLogEntry[], reqId: string, asOf: LocalDate): number`
  - `computeTat(args: { requestDate: LocalDate; endDate: LocalDate; holdDays: number }): number`
  - `type TatResult = "Meet" | "NotMeet" | "InProgress"`; `tatResult(tat: number, hasOffer: boolean, sla: number): TatResult`
  - `type AgingBand = "green" | "orange" | "red" | "darkred"`; `agingBand(days: number, bands: [number, number, number]): AgingBand`

- [ ] **Step 1: Write failing tests**
  ```ts
  // settings
  expect(parseSettings([])).toEqual({ defaultSlaDays: 30, agingBands: [30, 60, 90], backdateDays: 3 });
  expect(parseSettings([{ key: "default_sla_days", value: "45" }, { key: "aging_bands", value: "30,60,90" },
    { key: "backdate_days", value: "x" }])).toEqual({ defaultSlaDays: 45, agingBands: [30, 60, 90], backdateDays: 3 });
  expect(slaFor({ ...pos, sla_days: 14 }, defaults)).toBe(14);
  expect(slaFor({ ...pos, sla_days: null }, defaults)).toBe(30);
  expect(slaFor(undefined, defaults)).toBe(30);

  // holdDays: Hold 2026-10-01 -> resumed 2026-10-11 = 10 days; second Hold from 2026-11-10 still open
  const log = [
    entry("R1", "PendingHold", "Hold", "2026-10-01"),
    entry("R1", "Hold", "Vacancy", "2026-10-11"),
    entry("R1", "PendingHold", "Hold", "2026-11-10"),
    entry("R2", "PendingHold", "Hold", "2026-11-01"),
  ];
  expect(holdDays(log, "R1", "2026-11-17")).toBe(17);   // 10 + 7
  expect(holdDays(log, "R1", "2026-10-05")).toBe(4);    // clipped at asOf
  expect(holdDays(log, "R3", "2026-11-17")).toBe(0);

  // computeTat
  expect(computeTat({ requestDate: "2026-10-02", endDate: "2026-11-17", holdDays: 0 })).toBe(46);
  expect(computeTat({ requestDate: "2026-10-02", endDate: "2026-11-17", holdDays: 10 })).toBe(36);
  expect(computeTat({ requestDate: "2026-11-20", endDate: "2026-11-17", holdDays: 0 })).toBe(0); // upcoming

  // tatResult
  expect(tatResult(30, true, 30)).toBe("Meet");
  expect(tatResult(31, true, 30)).toBe("NotMeet");
  expect(tatResult(30, false, 30)).toBe("InProgress");
  expect(tatResult(31, false, 30)).toBe("NotMeet");

  // agingBand
  expect([0, 30, 31, 60, 61, 90, 91].map(d => agingBand(d, [30, 60, 90])))
    .toEqual(["green", "green", "orange", "orange", "red", "red", "darkred"]);
  ```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. `holdDays`: filter by `reqId`, sort by `effective_date` then `at`; a span opens on `to_status === "Hold"` and closes on the next entry with `from_status === "Hold"`; open span closes at `asOf`; each span clipped to `asOf`. `computeTat` = `max(0, daysBetween(requestDate, endDate) - holdDays)`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(domain): settings, TAT, hold days and aging`.

---

### Task 4: Permissions and Tracking view

**Files:**
- Create: `src/lib/domain/permissions.ts`, `src/lib/domain/tracking.ts`
- Test: `tests/domain/permissions.test.ts`, `tests/domain/tracking.test.ts`

**Interfaces:**
- Consumes: Tasks 2–3
- Produces (`permissions.ts`):
  - `normalizeEmail(e: string): string` (trim + lowercase)
  - `findActiveUser(users: User[], email: string): User | null`
  - `inScope(user: User, branch: Branch): boolean` — empty `scope` = all; else comma-separated tokens, each matched (trimmed, case-insensitive) against `branch.region` or `branch.branch_code`
  - `canEditRequisition(user: User, req: Requisition): boolean` — `super_admin` always; `ta` only when `normalizeEmail(req.ta_email) === normalizeEmail(user.email)`; `viewer` never
- Produces (`tracking.ts`):
  ```ts
  interface TrackingData { requisitions: Requisition[]; offers: Offer[]; log: StatusLogEntry[];
    branches: Branch[]; positions: Position[]; users: User[]; settings: AppSettings }
  interface TrackingRow { id: string; region: string; province: string; branchCode: string; branchName: string;
    positionName: string; requestDate: LocalDate; status: Status; upcoming: boolean; tat: number;
    tatResult: TatResult; agingBand: AgingBand | null; taEmail: string; taName: string; offerName: string | null;
    offerDate: LocalDate | null; canEdit: boolean; version: number }
  buildTrackingRows(data: TrackingData, viewer: User, today: LocalDate, opts: { mineOnly: boolean }): TrackingRow[]
  ```

- [ ] **Step 1: Write failing tests** (build a small dataset inline; today `"2026-11-17"`, default SLA 30)
  - `inScope`: scope `""` → true; `"ภาคกลาง"` → true for branch region `ภาคกลาง`, false for `ภาคเหนือ`; `"BKK-012, CNX-001"` → true for `CNX-001`.
  - `canEditRequisition`: super_admin true; ta with `ta_email: " Mind@Com7.co.th"` and user `mind@com7.co.th` → true; other ta → false; viewer → false.
  - `buildTrackingRows`:
    - excludes `Hold`, `Cancel`, `Hired`, `Transfer`; includes the four on-process statuses
    - Vacancy requested `2026-10-02` → `tat 46`, `tatResult "NotMeet"`, `agingBand "orange"`
    - Offer with `offer_date 2026-10-20`, requested `2026-10-02` → `tat 18`, `tatResult "Meet"`, `offerName "นายสมชาย ใจดี"`, `agingBand null` (aging only for not-yet-offered rows)
    - Vacancy requested `2026-11-20` → `upcoming true`, `tat 0`, `agingBand "green"`
    - viewer with scope `ภาคเหนือ` sees only northern rows
    - `mineOnly: true` for a ta returns only rows whose `ta_email` matches
    - row whose `branch_code` is missing from `branches` is still returned with `branchName` = the code and region `"ไม่ระบุ"` (never dropped silently)
    - sort order: region, branchName, positionName, requestDate ascending
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Offer lookup by `req.offer_id`; TAT end = offer date when status is `Offer`, else today; hold days via `holdDays(log, id, end)`; `taName` from `users` by email, fallback to email.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(domain): permissions and tracking view model`.

---

### Task 5: Sheet schema and row mapping

**Files:**
- Create: `src/lib/sheets/schema.ts`, `src/lib/sheets/rows.ts`
- Test: `tests/sheets/rows.test.ts`

**Interfaces:**
- Produces (`schema.ts`):
  ```ts
  type ColType = "string" | "number" | "date" | "bool";
  interface ColSpec { key: string; type: ColType }
  interface TabSpec { name: TabName; columns: ColSpec[]; system: boolean }  // system = protected (warning only)
  const TABS: Record<TabName, TabSpec>
  ```
  `TabName` covers every tab in spec §10: `Branches, Positions, SourcingChannels, RecruiterAssignments, Users, Settings, Import_Initial, Import_Requisition, Import_Resign, Import_Transfer, Import_NewEmployee, Requisitions, Offers, NewHires, Turndowns, Approvals, StatusLog, ReviewQueue, MonthlySnapshots, Requisitions_Archive, StatusLog_Archive`. Column keys and order exactly as spec §10 (NewHires/Turndowns = Offers columns + their extra columns; archives = same columns as source). `system: true` for Requisitions, Offers, NewHires, Turndowns, Approvals, StatusLog, ReviewQueue, MonthlySnapshots, both archives.
- Produces (`rows.ts`):
  - `interface ParseIssue { row: number; column: string; value: unknown; message: string }`
  - `rowsToObjects<T>(spec: TabSpec, values: unknown[][]): { rows: T[]; issues: ParseIssue[] }` — `values[0]` is the header row; columns are matched **by header name**, not position; fully blank rows skipped; `date` accepts serial number or text via `parseUserDate`, invalid → `null` + issue; `number` invalid → `null` + issue; `bool` accepts `TRUE/true/1/ใช่`; strings trimmed. `row` in issues is the 1-based Sheet row number.
  - `objectToRow(spec: TabSpec, header: string[], obj: Record<string, unknown>): unknown[]` — ordered by the sheet's actual header; dates → serial; `null` → `""`
  - `findRowNumberById(idColumn: unknown[], id: string): number | null` — `idColumn[0]` is the header; returns 1-based Sheet row number; throws if the id appears twice

- [ ] **Step 1: Write failing tests**
  ```ts
  const values = [
    ["id", "branch_code", "request_date", "version"],
    ["REQ-1", " BKK-012 ", 46297, 3],
    ["", "", "", ""],                       // blank row skipped
    ["REQ-2", "CNX-001", "17/11/2569", "1"], // BE text date
    ["REQ-3", "CNX-001", "ไม่ทราบ", 1],      // bad date
  ];
  // with a test TabSpec of those 4 columns
  expect(rows.map(r => r.request_date)).toEqual(["2026-10-02", "2026-11-17", null]);
  expect(rows[0].branch_code).toBe("BKK-012");
  expect(issues).toEqual([expect.objectContaining({ row: 5, column: "request_date" })]);

  // header order differs from spec order -> still mapped by name
  const swapped = [["version", "id", "request_date", "branch_code"], [2, "REQ-9", 46343, "X"]];
  expect(rowsToObjects(spec, swapped).rows[0]).toMatchObject({ id: "REQ-9", version: 2, request_date: "2026-11-17" });

  expect(objectToRow(spec, ["version", "id", "request_date", "branch_code"],
    { id: "REQ-9", branch_code: "X", request_date: "2026-11-17", version: 2 })).toEqual([2, "REQ-9", 46343, "X"]);

  // Ju inserted blank rows / sorted
  expect(findRowNumberById(["id", "REQ-3", "", "REQ-1", "REQ-2"], "REQ-1")).toBe(4);
  expect(findRowNumberById(["id", "REQ-3"], "REQ-1")).toBeNull();
  expect(() => findRowNumberById(["id", "REQ-1", "REQ-1"], "REQ-1")).toThrow();

  // every TabSpec has an "id" column when system === true
  for (const t of Object.values(TABS)) if (t.system && t.name !== "MonthlySnapshots") expect(t.columns.some(c => c.key === "id")).toBe(true);
  ```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement both files.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(sheets): tab schema and row mapping`.

---

### Task 6: Repository (memory + Google Sheets)

**Files:**
- Create: `src/lib/repo/types.ts`, `src/lib/repo/memory-repo.ts`, `src/lib/repo/sheets-repo.ts`, `src/lib/repo/fixtures.ts`, `src/lib/repo/index.ts`, `src/lib/sheets/client.ts`
- Test: `tests/repo/memory-repo.test.ts`, `tests/repo/sheets-repo.test.ts`

**Interfaces:**
- Consumes: `TABS`, `rowsToObjects`, `objectToRow`, `findRowNumberById` (Task 5); domain types (Task 3)
- Produces:
  ```ts
  type RowOf<T extends TabName>  // maps TabName -> row interface (Requisition, Offer, ... ; Record<string, unknown> for tabs without a domain type yet)
  class ConflictError extends Error {}
  class NotFoundError extends Error {}
  interface Repo {
    list<T extends TabName>(tab: T): Promise<RowOf<T>[]>;                 // cached up to 60 s
    getFresh<T extends TabName>(tab: T, id: string): Promise<RowOf<T> | null>; // bypasses cache
    append<T extends TabName>(tab: T, rows: RowOf<T>[]): Promise<void>;
    update<T extends TabName>(tab: T, id: string, patch: Partial<RowOf<T>>, expectedVersion?: number): Promise<RowOf<T>>;
    invalidate(tab: TabName): Promise<void>;
  }
  getRepo(): Repo   // DATA_SOURCE=memory -> singleton MemoryRepo(fixtures), "sheets" -> SheetsRepo
  fixtures: { [K in TabName]?: RowOf<K>[] }
  ```
  `update` semantics (both impls): if the tab has a `version` column and `expectedVersion` is given and differs from the stored version → `ConflictError`; on success stored `version` becomes old + 1 and `updated_at` = now ISO. Missing id → `NotFoundError`.

- [ ] **Step 1: Write failing tests for MemoryRepo**
  - `list("Requisitions")` returns fixtures; `update("Requisitions", "REQ-0001", { status: "Offer" }, 1)` returns version 2; second update with expectedVersion 1 → `ConflictError`; `update` unknown id → `NotFoundError`; `append` then `list` includes the new row.
- [ ] **Step 2: Write failing tests for SheetsRepo** with a fake Sheets API object injected via constructor (`new SheetsRepo({ api: fakeApi, sheetId: "x", cache: noCache })`):
  - `update` reads the `id` column fresh, finds row 4 when the fake sheet has a blank row 2 and the target at row 4, and writes the range `Requisitions!A4:<lastCol>4`
  - stale `expectedVersion` → `ConflictError` and **no** write call made
  - `update` calls `invalidate("Requisitions")`
  - `append` uses `values.append` with `valueInputOption: "RAW"` and dates as serials
- [ ] **Step 3:** Run → FAIL.
- [ ] **Step 4:** Implement.
  - `client.ts`: `google.sheets({ version: "v4", auth: new google.auth.JWT({ email, key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"), scopes: [".../auth/spreadsheets"] }) })`.
  - `SheetsRepo.list` reads `<tab>!A:ZZ` with `UNFORMATTED_VALUE` through a cache abstraction `{ get(key, ttlSec, tag, fn), invalidate(tag) }`; production cache = Next data cache with tag `sheet:<tab>`, revalidate 60 (pick `unstable_cache` or `"use cache"` + `cacheTag`/`cacheLife` per installed Next version). Parse issues are logged with `console.warn`, never thrown.
  - `update`: read header + `id` column + `version` column fresh → `findRowNumberById` → version check → merge patch onto fresh row → `values.update` one range.
  - `fixtures.ts`: ≈ 3 regions, 6 branches, 4 positions, 25 requisitions across all statuses (incl. one upcoming, one with a Hold history, one Offer), 3 users (`ju@example.com` super_admin, `mind@example.com` ta, `boss@example.com` viewer), settings defaults, 5 sourcing channels.
- [ ] **Step 5:** Run → PASS.
- [ ] **Step 6:** Commit `feat(repo): memory and Google Sheets repositories`.

---

### Task 7: Auth and route guard

**Files:**
- Create: `src/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/proxy.ts`, `src/app/login/page.tsx`, `src/lib/auth/session-user.ts`
- Test: `tests/auth/allowlist.test.ts`

**Interfaces:**
- Consumes: `findActiveUser`, `normalizeEmail` (Task 4), `getRepo` (Task 6)
- Produces:
  - `isAllowed(users: User[], email: string | null | undefined): boolean` (in `session-user.ts`, pure)
  - `getSessionUser(): Promise<User>` — server-only; reads session, re-loads the `Users` tab, redirects to `/login` if missing or inactive (so role/scope changes apply without re-login)
  - `auth`, `signIn`, `signOut`, `handlers` from `src/auth.ts`

- [ ] **Step 1: Write failing test**
  ```ts
  const users = [{ email: "Ju@Com7.co.th ", role: "super_admin", active: true, ... },
                 { email: "old@com7.co.th", role: "ta", active: false, ... }];
  expect(isAllowed(users, "ju@com7.co.th")).toBe(true);
  expect(isAllowed(users, "old@com7.co.th")).toBe(false);
  expect(isAllowed(users, "stranger@gmail.com")).toBe(false);
  expect(isAllowed(users, null)).toBe(false);
  ```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Providers: Google; plus a Credentials provider (email only, no password) **registered only when `process.env.AUTH_DEV_LOGIN === "1" && process.env.NODE_ENV !== "production"`**. `signIn` callback → `isAllowed(await repo.list("Users"), email)`. JWT session strategy. `proxy.ts` redirects unauthenticated requests to `/login` except `/login`, `/api/auth/*`, static assets. Login page: Thai copy "เข้าสู่ระบบด้วย Google"; dev form shown only when dev login enabled.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(auth): Google login with Sheet allowlist`.

---

### Task 8: Google Sheet setup and seed scripts

**Files:**
- Create: `scripts/setup-sheet.ts`, `scripts/seed-sheet.ts`, `src/lib/sheets/setup-requests.ts`
- Test: `tests/sheets/setup-requests.test.ts`

**Interfaces:**
- Consumes: `TABS` (Task 5), `fixtures` (Task 6), `client.ts` (Task 6)
- Produces: `buildSetupRequests(existing: { title: string; sheetId: number }[]): sheets_v4.Schema$Request[]` (pure, idempotent); scripts `pnpm sheet:setup`, `pnpm sheet:seed`

- [ ] **Step 1: Write failing tests** for `buildSetupRequests`:
  - empty spreadsheet → one `addSheet` per tab in `TABS`
  - all tabs already exist → no `addSheet` requests (idempotent)
  - every `date` column gets a `repeatCell` with `numberFormat { type: "DATE", pattern: "dd/mm/yyyy" }`
  - every `system` tab gets one `addProtectedRange` with `warningOnly: true`
  - header row frozen (`gridProperties.frozenRowCount: 1`) on every tab
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. `setup-sheet.ts`: fetch spreadsheet metadata → `addSheet` requests → second `batchUpdate` with formats/protection → write header rows → write default `Settings` rows if empty → print summary. `seed-sheet.ts`: refuses to run unless `SHEET_ID` equals `TEST_SHEET_ID` env (guard against seeding production); writes fixtures. Add `"sheet:setup": "tsx --env-file=.env.local scripts/setup-sheet.ts"` and `"sheet:seed"` to `package.json`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(sheets): setup and seed scripts`.

---

### Task 9: Tracking page

**Files:**
- Create: `src/app/(app)/layout.tsx`, `src/app/(app)/tracking/page.tsx`, `src/app/(app)/tracking/tracking-view.tsx`, `src/components/aging-badge.tsx`, `src/components/status-badge.tsx`
- Modify: `src/app/layout.tsx` (font `IBM_Plex_Sans_Thai` via `next/font/google`, weights 400/500/600, `lang="th"`), `src/app/page.tsx` (redirect `/tracking`)

**Interfaces:**
- Consumes: `getSessionUser` (Task 7), `getRepo` (Task 6), `buildTrackingRows`, `parseSettings`, `todayBangkok`, `formatThaiDate`
- Produces: route `/tracking?mine=1|0&region=&q=`

- [ ] **Step 1:** Server page loads all `TrackingData` tabs in parallel via `repo.list`, builds rows with `mineOnly` = `searchParams.mine` (default `1` for `ta`, `0` otherwise), passes rows + today to the client view.
- [ ] **Step 2:** Client view: toggle "ของฉัน / ทั้งหมด", region select, search box (branch / position / TA); grouped by region → branch. ≥ 768 px: table with columns ตำแหน่ง, วันที่แจ้งสรรหา, TAT, ผล TAT, สถานะ, TA. < 768 px: one card per row. Upcoming rows show badge `ว่างวันที่ dd/mm/yyyy`. Aging badge colours: green `#16a34a`, orange `#ea580c`, red `#dc2626`, darkred `#7f1d1d` (text white) — with the day count as text so colour is never the only signal. Status labels in Thai: Vacancy=ว่าง, Offer=Offer แล้ว, PendingCancel=รออนุมัติยกเลิก, PendingHold=รออนุมัติพัก. Rows are not clickable yet (Phase 2).
- [ ] **Step 3:** Header shows user name, role, "ออกจากระบบ", and a "รีเฟรชข้อมูล" button (server action calling `repo.invalidate` for the tracking tabs then `router.refresh()`).
- [ ] **Step 4:** Verify: `DATA_SOURCE=memory AUTH_DEV_LOGIN=1 pnpm dev`, log in as `mind@example.com` → sees only own rows by default; toggle "ทั้งหมด" → sees all; `boss@example.com` → no "ของฉัน" toggle default; resize to 375 px → cards, no horizontal scroll. `pnpm build && pnpm lint && pnpm test` all pass.
- [ ] **Step 5:** Commit `feat(ui): read-only tracking page`.

---

### Task 10: Setup documentation and Phase 1 hand-off

**Files:**
- Modify: `README.md`

- [ ] **Step 1:** README in Thai: what the app is; run locally with memory data (3 commands); how to create a Google Cloud project, enable Sheets API, create a service account + key, share the Sheet with the service-account email as Editor, create OAuth client (redirect `http://localhost:3000/api/auth/callback/google` and the Vercel URL), fill `.env.local`, run `pnpm sheet:setup`; Vercel env vars list; note that Vercel **Pro** is needed for company use.
- [ ] **Step 2:** Full check: `pnpm test && pnpm lint && pnpm build` → all green.
- [ ] **Step 3:** Commit `docs: setup guide for Phase 1`.
