"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { refreshData } from "./actions";

export function RefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await refreshData();
          router.refresh();
          toast.success("โหลดข้อมูลล่าสุดแล้ว");
        })
      }
    >
      {pending ? "กำลังโหลด…" : "รีเฟรชข้อมูล"}
    </Button>
  );
}
