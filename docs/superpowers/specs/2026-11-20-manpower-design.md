# กำลังพล (Quota / Actual) — design

Approved by the user in conversation (2026-11-20): keep Quota and Actual from HR's file and show them on a new page; each new HR import **overwrites** the previous figures.

## Intent

HR's "Quota Branch" file holds, per branch and position, the quota and the people actually there. Our import used to keep only the shortage (as vacancies) and threw the rest away. We want to see per branch whether it is full, short or over, and compare HR's shortage with what recruiters actually have open in the system.

## Goals

- New tab `Quota`: one row per branch × position — `branch_code`, `position_code`, `quota`, `actual`, `report_date`. Written by `pnpm quota:import` (a fourth tab in the import file) and pasted over the whole tab, like Branches/Positions.
- New page "กำลังพล" (`/manpower`, menu item for every role):
  - summary cards: Quota, Actual, short, over, branches full
  - table per branch: BU, branch, Quota, Actual, short, over, status (ขาด / เกิน / ครบ), open in system, and a match badge
  - a branch row expands to its positions (Quota, Actual, gap, open in system)
  - filters: BU, ภาค, สถานะ, search; Export Excel with the same filters
- "Open in system" = requisitions of that branch and position in `ON_PROCESS` statuses whose request date has arrived. Per branch it is the sum over positions. Match badge per position and per branch: `open == short` → ตรงกัน; `open < short` → เปิดไม่ครบ; `open > short` → เปิดเกิน.

## Definitions

- Per position: `short = max(0, quota − actual)`, `over = max(0, actual − quota)`. Per branch: the sums of the positions (so a surplus Cashier does not hide a missing PIA). Branch status: `short > 0` → ขาด; else `over > 0` → เกิน; else ครบ.
- Closed branches (status `Closed`) are not listed; their count is shown in a note.
- Viewer scope applies (`inScope`): out-of-scope branches and their rows are invisible, in the export too.

## Non-goals

- History across imports (the user chose overwrite). Transfer suggestions from over to short branches. A per-BU comparison table. Editing Quota in the web.

## Approaches considered

1. **New `Quota` tab, written by the import, read by the page (chosen).** Simple, same pattern as Branches/Positions, no new write path in the web.
2. Put quota/actual columns on `Positions` or `Branches`. Wrong grain (it is per branch × position).
3. Compute from `Requisitions` only. HR's actual headcount is not in the system; impossible.

## Constraints

- `Quota` is not a system tab (pasted by an admin); old sheets get it from `pnpm sheet:setup` (it already creates missing tabs).
- Positions the import cannot give a code (not in `Quota01_Summary`) are skipped with the existing warning.
- Dates: `report_date` is the date of the HR report, as for `Import_Initial`.

## Left to the builder

Page layout and wording within the existing glass/pill style, the sheet layout of the Excel export, how the expanding rows are built.
