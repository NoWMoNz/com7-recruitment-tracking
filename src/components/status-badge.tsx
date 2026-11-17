import { Badge } from "@/components/ui/badge";
import type { Status } from "@/lib/domain/types";

export const STATUS_LABEL: Record<Status, string> = {
  Vacancy: "ว่าง",
  Offer: "Offer แล้ว",
  PendingCancel: "รออนุมัติยกเลิก",
  PendingHold: "รออนุมัติพัก",
  Hold: "พัก",
  Cancel: "ยกเลิก",
  Hired: "ได้คนแล้ว",
  Transfer: "โอนย้าย",
};

const VARIANT: Partial<Record<Status, "default" | "secondary" | "outline">> = {
  Vacancy: "outline",
  Offer: "default",
  PendingCancel: "secondary",
  PendingHold: "secondary",
};

export function StatusBadge({ status }: { status: Status }) {
  return <Badge variant={VARIANT[status] ?? "outline"}>{STATUS_LABEL[status]}</Badge>;
}
