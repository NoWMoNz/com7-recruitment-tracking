import type {
  Branch,
  Offer,
  Position,
  Requisition,
  SettingRow,
  StatusLogEntry,
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

interface RowMap {
  Requisitions: Requisition;
  Requisitions_Archive: Requisition;
  Offers: Offer;
  StatusLog: StatusLogEntry;
  StatusLog_Archive: StatusLogEntry;
  Branches: Branch;
  Positions: Position;
  Users: User;
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

export interface Repo {
  /** May be served from a cache up to 60 seconds old. */
  list<T extends TabName>(tab: T): Promise<RowOf<T>[]>;
  /** Always reads the source, bypassing any cache. */
  getFresh<T extends TabName>(tab: T, id: string): Promise<RowOf<T> | null>;
  append<T extends TabName>(tab: T, rows: RowOf<T>[]): Promise<void>;
  /** Throws ConflictError when expectedVersion is given and stale; NotFoundError when id is missing. */
  update<T extends TabName>(tab: T, id: string, patch: Partial<RowOf<T>>, expectedVersion?: number): Promise<RowOf<T>>;
  invalidate(tab: TabName): Promise<void>;
}
