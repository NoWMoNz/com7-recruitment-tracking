# AM / RM / TA — design

Approved by the user in conversation (2026-11-24). Part 2 of the user's feedback round (part 1 was labels and layout; part 3 is the Offer start date and a Hired page; part 4 is Excel export on every page).

## Intent

Area Managers (AM) and Regional Managers (RM) follow recruiting by their own shops, and TAs hand branches to each other. Today the system knows neither AM nor RM. Only super_admin can change which TA owns a branch, and the change does not move positions that are already open. The feedback asks for:

- the AM, RM and TA names on the pages
- filters by those names
- any TA being able to change a branch's TA

## Goals

1. **Data**
   - `Branches` gets two columns, `am` and `rm`: one name each, empty = not set.
   - `pnpm quota:import` fills them from the **Zone** sheet of HR's "Quota Branch" file:
     - match on `ID` = `branch_code`
     - when an ID has several rows, use the one that has names; `-` and blank count as empty
     - a file without a Zone sheet still imports, with a warning and empty `am`/`rm`
   - Master Data → Branches shows and edits `am`/`rm`.
2. **Change a branch's TA (tracking page)**
   - The branch header shows `AM … · RM … · TA …`, plus a "เปลี่ยน" button for `ta` and `super_admin` (not `viewer`).
   - Picking a TA (active users with role ta/super_admin, the same list the edit dialog uses) does three things:
     - **Replaces all `RecruiterAssignments` rows of that branch** with one branch-wide row (`position_group` empty) for the new TA.
     - **Moves every not-closed requisition of that branch** (Vacancy, Offer, PendingCancel, PendingHold, Hold) to the new TA (`ta_email`, version bump).
     - Writes a StatusLog entry per moved requisition, the same "OwnerChange" entry super_admin's per-position edit writes: `from_status` = current status, `to_status` = `OwnerChange`, note `เจ้าของ <old> → <new>: เปลี่ยน TA ประจำสาขา`, actor = the viewer. History already labels it "เปลี่ยน TA เจ้าของ", and status math ignores it.
   - "TA of a branch" (for display) = its branch-wide assignment, else the TA most of its open requisitions belong to, else empty.
3. **Filters `AM`, `RM`, `TA`** (dropdowns, "ทุก AM / ทุก RM / ทุก TA")
   - Pages: Dashboard, tracking (ติดตามการสรรหา), manpower (กำลังพล), Report.
   - AM and RM filter by the requisition's / row's branch. TA filters by the requisition owner (`ta_email`). On manpower, TA means the branch's TA (as defined above).
   - The Report already has a TA filter. It gains `am` and `rm` URL params, kept by its links and its export.
4. **Columns**
   - Manpower table: AM, RM, TA per branch row.
   - Report "รายสัปดาห์": `แยกตาม AM` and `แยกตาม RM` tables beside `แยกตาม TA`.

## Non-goals

- AM/RM in Excel exports. That is part 4.
- AM/RM filters on Hold, Resignations, Approvals. Not asked for; they can follow in part 4.
- History of AM/RM changes. Each import overwrites them, like the other branch columns.
- Per-position-group TA editing for TAs. The branch-wide rule replaces group rules when a TA edits. super_admin can still add group rules in Master Data.

## Approaches considered

1. **`am`/`rm` columns on `Branches`, filled by the existing import (chosen).** One AM/RM per branch (checked: every AM sits under exactly one RM). Every page already loads Branches. The import already writes the Branches tab.
2. A separate `BranchManagers` tab. Same grain as Branches, so it is an extra join on every page for nothing.
3. Uploading HR's file in the web. There is no upload path today, and it is far beyond the request.

For the TA change: **a button on the tracking page's branch header (chosen)**, where TAs already work. The other option, opening Master Data to TAs, exposes admin settings and the group-rule detail.

## Constraints and facts

- HR file of 11 Nov 2026:
  - 1,073 shops in `All`; 937 have RM/AM in `Zone`, 136 have none
  - 302 IDs repeat in Zone (one named row and one blank row, never conflicting)
  - 18 RMs, 81 AMs
- `Branches` is not a system tab. Old sheets get the new columns by re-running `pnpm sheet:setup` (it appends missing header columns) or by pasting the new import output. Until then the app reads `am`/`rm` as empty, and saving a branch in Master Data shows the existing "รัน pnpm sheet:setup" error.
- Viewer scope (`inScope`) still decides what is visible. A TA can change a branch's TA only for branches in their scope.
- A monthly report filtered by AM/RM is computed live, never from a closed-month snapshot (snapshots are per TA × region only), exactly as the BU/branch filters already behave.
- Writes go through the repo with version checks (`updateMany`), like other bulk requisition changes.

## Left to the builder

- Exact placement and size of the dropdowns in each filter bar (follow each page's existing pill style).
- The confirm dialog wording for the TA change (it must say how many open positions will move).
