# รายชื่อลาออก และยกเลิกลาออก — design

Approved by the user in conversation (2026-11-20). Small-to-medium change: one new page, three new columns, one action.

## Intent

The senior colleague wants to see who has resigned, and wants a TA to be able to record that a resignation was withdrawn. Today a resignation arrives only as a row in the `Import_Resign` tab, becomes a requisition (source `Resign`, `source_ref` = `RESIGN:<employee_id>:<effective_date>`) when processed, and there is no page that lists it and no way to undo it. The only route is an ordinary Cancel request, which needs evidence and admin approval, and the system does not know that the vacancy came from a withdrawn resignation.

## Goals

- A page "รายชื่อลาออก" listing every resignation row that has been processed: employee name and id, BU, region, branch, position, effective date, resignation state, and the state of the linked requisition.
- Filters BU, region, date range (effective date, with "ทั้งหมด"), search; Excel export — same behaviour as the other pages.
- A TA (in scope) or admin can mark a resignation as withdrawn with a required reason. Who and when are recorded.
- The withdrawal handles the linked requisition automatically (below).

## Non-goals

- Entering resignations by hand in the web (they still come from HR's file through `Import_Resign`).
- Undoing a withdrawal.
- Quota / Actual dashboards from the colleague's file (separate piece of work).

## Behaviour of the withdrawal

Linked requisition = the requisition whose `source_ref` equals `RESIGN:<employee_id>:<effective_date>`.

| State of the linked requisition | What happens |
|---|---|
| `Vacancy` (also not yet effective, i.e. `request_date` in the future) | Closed as `Cancel` right away, **no approval and no evidence**, log note "ยกเลิกลาออก". User decision. |
| `Offer` (an Offer was already made) | Left alone. A `ReviewQueue` item tells the admin "ยกเลิกลาออก แต่มี Offer แล้ว (ชื่อผู้ได้รับ Offer)" so a person decides (keep the new hire or turn down). |
| `PendingCancel`, `PendingHold`, `Hold` | Left alone; the withdrawal is recorded and a `ReviewQueue` item is added, as for `Offer`. (builder's call) |
| Already closed (`Hired`, `Cancel`, `Transfer`) or no linked requisition | Only the withdrawal is recorded. |

A withdrawn resignation shows state "ยกเลิกลาออก". Resignation state otherwise: "รอถึงวันมีผล" (effective date in the future) or "ลาออกแล้ว".

## Approaches considered

1. **Add columns to `Import_Resign` and build the page from it (chosen).** `cancelled_at`, `cancelled_by`, `cancel_note`. One source of truth, the list and the withdrawal live on the same row, sheet:setup already adds missing columns. Downside: the import tab now holds user-written data.
2. A new `Resignations` tab filled by the processor. Cleaner separation but duplicates every row and needs a migration for existing rows.
3. Derive the list from requisitions with source `Resign`. No employee name on a requisition, so the list would have no names. Rejected.

## Constraints

- Sheets storage: new columns are matched by header name; existing rows read as empty (not withdrawn).
- Optimistic concurrency: the requisition has a `version`; the withdrawal must use it like other status changes.
- Scope: a TA sees and acts only on branches in scope (same rules as tracking). Viewers see the list, cannot withdraw.
- Withdrawing twice must do nothing the second time.

## Left to the builder

Page layout (follow the existing glass cards, filter bar and table style), menu position and icon, Thai wording of the states, the ReviewQueue kind name, the layout of the Excel sheet.
