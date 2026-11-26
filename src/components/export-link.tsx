import { Download } from "lucide-react";
import { cn } from "@/lib/utils";

/** The "Export Excel" pill every page uses; `href` is an /api/export/... route with the page's filters. */
export function ExportLink({ href, className }: { href: string; className?: string }) {
  return (
    <a
      href={href}
      download
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-ink-chip px-4 text-sm font-medium text-white outline-none hover:bg-ink-chip/85 focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      <Download className="size-4" aria-hidden />
      Export Excel
    </a>
  );
}
