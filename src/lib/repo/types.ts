import type {
  Approval,
  Branch,
  ImportInitial,
  ImportNewEmployee,
  ImportRequisition,
  ImportResign,
  QuotaLine,
  ImportTransfer,
  MonthlySnapshot,
  NewHire,
  ReviewItem,
  Offer,
  Position,
  Requisition,
  SettingRow,
  StatusLogEntry,
  Turndown,
  User,
} from "@/lib/domain/types";
import type { TabName } from "@/lib/sheets/schema";

export interface SourcingChannel {
  channel: string;
  active: boolean;
}

export interface RecruiterAssignment {
  branch_code: string;
  position_group: string;
  ta_email: string;
}

/** A name + password sign-in (Logins tab). `email` is the Users-tab account it acts as. */
export interface Login {
  username: string;
  email: string;
  password_hash: string;
}

interface RowMap {
  Requisitions: Requisition;
  Requisitions_Archive: Requisition;
  Offers: Offer;
  Turndowns: Turndown;
  Approvals: Approval;
  NewHires: NewHire;
  ReviewQueue: ReviewItem;
  MonthlySnapshots: MonthlySnapshot;
  Import_Initial: ImportInitial;
  Import_Requisition: ImportRequisition;
  Import_Resign: ImportResign;
  Quota: QuotaLine;
  Import_Transfer: ImportTransfer;
  Import_NewEmployee: ImportNewEmployee;
  StatusLog: StatusLogEntry;
  StatusLog_Archive: StatusLogEntry;
  Branches: Branch;
  Positions: Position;
  Users: User;
  Logins: Login;
  Settings: SettingRow;
  SourcingChannels: SourcingChannel;
  RecruiterAssignments: RecruiterAssignment;
}

export type RowOf<T extends TabName> = T extends keyof RowMap ? RowMap[T] : Record<string, unknown>;

export type Dataset = { [K in TabName]?: RowOf<K>[] };

export class ConflictError extends Error {
  constructor(message = "ข้อมูลถูกแก้โดยคนอื่น กรุณาโหลดใหม่") {
    super(message);
    this.name = "ConflictError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "ไม่พบข้อมูล") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** The sheet's header lacks columns this version of the app needs; `pnpm sheet:setup` adds them. */
export class MissingColumnError extends Error {
  constructor(tab: string, columns: string[]) {
    super(`แท็บ ${tab} ยังไม่มีคอลัมน์ ${columns.join(", ")} (รัน pnpm sheet:setup)`);
    this.name = "MissingColumnError";
  }
}

/** The Sheet has no tab by this name (a tab added by a newer version of the app); `pnpm sheet:setup` creates it. */
export class MissingTabError extends Error {
  constructor(tab: string) {
    super(`ไม่พบแท็บ ${tab} ใน Google Sheet (รัน pnpm sheet:setup หรือสร้างแท็บชื่อ ${tab} เองพร้อมหัวคอลัมน์)`);
    this.name = "MissingTabError";
  }
}

export interface Repo {
  /** Throws MissingColumnError when the tab's header lacks any of these columns (always passes for the in-memory repo). */
  requireColumns(tab: TabName, columns: string[]): Promise<void>;
  /** May be served from a cache up to 60 seconds old. */
  list<T extends TabName>(tab: T): Promise<RowOf<T>[]>;
  /** Always reads the source, bypassing any cache. */
  getFresh<T extends TabName>(tab: T, id: string): Promise<RowOf<T> | null>;
  append<T extends TabName>(tab: T, rows: RowOf<T>[]): Promise<void>;
  /** Throws ConflictError when expectedVersion is given and stale; NotFoundError when id is missing. */
  update<T extends TabName>(tab: T, id: string, patch: Partial<RowOf<T>>, expectedVersion?: number): Promise<RowOf<T>>;
  /**
   * Several patches to one tab in a single write. Every expectedVersion is checked before anything is
   * written; one stale row throws ConflictError and nothing changes. Throws NotFoundError for a missing id.
   */
  updateMany<T extends TabName>(tab: T, items: { id: string; patch: Partial<RowOf<T>>; expectedVersion?: number }[]): Promise<void>;
  /** Rows with their sheet row number (header = row 1), for tabs without an id column such as Import_*. */
  listNumbered<T extends TabName>(tab: T): Promise<{ rowNumber: number; row: RowOf<T> }[]>;
  /** Patches rows by sheet row number in a single write (used to mark Import rows processed). */
  updateAt<T extends TabName>(tab: T, items: { rowNumber: number; patch: Partial<RowOf<T>> }[]): Promise<void>;
  /** Removes rows by sheet row number (tabs without an id column). Sheet rows are blanked, not shifted. */
  removeAt(tab: TabName, rowNumbers: number[]): Promise<void>;
  /** Removes the row with this id (a Sheet row is blanked, not shifted). Throws NotFoundError when missing. */
  remove(tab: TabName, id: string): Promise<void>;
  invalidate(tab: TabName): Promise<void>;
}
