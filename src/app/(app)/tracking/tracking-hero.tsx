import type { ReactNode } from "react";
import { MapPin } from "lucide-react";
import { HeroGallery } from "./hero-gallery";

/** Company name at the top-left corner of the banner. */
function HeroBrand() {
  return (
    <p className="flex items-center gap-2.5 text-sm font-medium text-white drop-shadow-sm">
      <span aria-hidden className="grid size-8 place-items-center rounded-full bg-white text-[#0a2a6b] shadow-sm">
        <MapPin className="size-4" />
      </span>
      Com7 Public Company Limited
    </p>
  );
}

/**
 * Photo banner. `bottom` (left) and `top` (right, same row) are slots for glass controls such as region tabs and export.
 * On large screens the aging card overlaps the lower-left corner, so the bottom row starts to its right.
 */
export function TrackingHero({
  top,
  bottom,
  title = "ตำแหน่งที่กำลังสรรหา",
  description = "ดูความคืบหน้าของทุกตำแหน่งที่ยังดำเนินการอยู่ ทั้งว่าง Offer แล้ว และรออนุมัติ",
}: {
  top?: ReactNode;
  bottom?: ReactNode;
  title?: string;
  description?: string;
}) {
  return (
    <section className="relative isolate flex min-h-[22rem] flex-col justify-between gap-6 overflow-hidden rounded-[2rem] text-white lg:min-h-[24rem]">
      <HeroGallery />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-[#0a2a6b]/90 via-[#0d3d8f]/55 to-[#0d3d8f]/5" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-2/5 bg-gradient-to-t from-black/35 to-transparent" />

      <div className="flex min-h-9 items-start p-5 sm:p-6">
        <HeroBrand />
      </div>

      <div className="px-5 sm:px-8">
        <h1 className="font-heading text-4xl leading-tight font-light sm:text-5xl">{title}</h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/80">
          {description}
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 p-5 pt-0 sm:p-6 sm:pt-0 lg:pl-[23.5rem]">
        {bottom}
        {top}
      </div>
    </section>
  );
}

/**
 * Photo banner that ends just below the `bottom` controls. `children` follow it, inset a little on each
 * side so the photo reads slightly wider than the cards; on large screens the first card may overlap it.
 */
export function HeroStage({
  title,
  description,
  top,
  bottom,
  children,
}: {
  title: string;
  description: string;
  top?: ReactNode;
  bottom?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <section className="relative isolate flex min-h-[22rem] flex-col justify-between gap-6 overflow-hidden rounded-[2rem] text-white lg:min-h-[24rem]">
        <HeroGallery />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-[#0a2a6b]/85 via-[#0d3d8f]/45 to-[#0d3d8f]/0" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-2/5 bg-gradient-to-t from-black/30 to-transparent" />

        <div className="flex min-h-9 items-start p-5 sm:p-6">
          <HeroBrand />
        </div>
        <div className="px-5 sm:px-8">
          <h1 className="font-heading text-4xl leading-tight font-light sm:text-5xl">{title}</h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/80">{description}</p>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3 p-5 pt-0 sm:p-6 sm:pt-0 lg:pb-11 lg:pl-[23.5rem]">
          {bottom}
          {top}
        </div>
      </section>

      <div className="px-3 sm:px-4 lg:px-6">{children}</div>
    </div>
  );
}
