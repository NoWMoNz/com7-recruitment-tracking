import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const GLASS_FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-white";

/** Glass tab group that sits on the photo banner. */
export function GlassTabs({ children, label, className }: { children: ReactNode; label: string; className?: string }) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex max-w-full gap-1 overflow-x-auto [scrollbar-width:none] rounded-full bg-black/25 p-1 backdrop-blur-md", className)}>
      {children}
    </div>
  );
}

export function glassTab(active: boolean) {
  return cn(
    "shrink-0 rounded-full px-4 py-1.5 text-sm whitespace-nowrap transition-colors",
    GLASS_FOCUS,
    active ? "bg-white/95 font-medium text-[#0a2a6b] shadow-[0_4px_12px_rgba(10,40,110,0.3),inset_0_1px_0_#fff]" : "text-white hover:bg-white/20",
  );
}
