"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { refreshData } from "./actions";

export function RefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label="รีเฟรชข้อมูล"
      title={pending ? "กำลังโหลด…" : "รีเฟรชข้อมูล"}
      className="grid size-10 place-items-center rounded-full bg-white/80 text-foreground ring-1 ring-black/[0.05] transition-colors outline-none hover:bg-white focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
      onClick={() =>
        start(async () => {
          await refreshData();
          router.refresh();
          toast.success("โหลดข้อมูลล่าสุดแล้ว");
        })
      }
    >
      <RefreshCw className={cn("size-4", pending && "animate-spin")} aria-hidden />
    </button>
  );
}
