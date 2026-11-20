"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

const SLIDES = [
  { src: "/hero-building.jpg", alt: "ตึกสำนักงาน COM7 มองจากมุมต่ำ", position: "75% 30%" },
  { src: "/hero-com7-office.jpg", alt: "อาคารสำนักงานใหญ่ COM7 มองจากด้านหน้า", position: "50% 35%" },
  { src: "/hero-com7-banner.jpg", alt: "ภาพจำลองอาคาร COM7 กับเส้นขอบฟ้ากรุงเทพ", position: "60% 40%" },
] as const;

const AUTO_MS = 8000;

/**
 * The photo behind the banner plus a row of small thumbnails that switch it. It also turns over on its own every few
 * seconds; hovering or focusing the row pauses that, and people who prefer reduced motion get no automatic change.
 */
export function HeroGallery() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((n) => (n + 1) % SLIDES.length), AUTO_MS);
    return () => clearInterval(t);
  }, [paused, i]);

  return (
    <>
      {SLIDES.map((s, n) => (
        <Image
          key={s.src}
          src={s.src}
          alt=""
          fill
          priority={n === 0}
          unoptimized
          sizes="(min-width: 1024px) 85vw, 100vw"
          style={{ objectPosition: s.position }}
          className={cn("-z-20 object-cover transition-opacity duration-700 motion-reduce:transition-none", n === i ? "opacity-100" : "opacity-0")}
        />
      ))}

      <div
        role="group"
        aria-label="เปลี่ยนรูปพื้นหลัง"
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        className="absolute top-5 right-5 z-10 flex items-center gap-2 rounded-[1.25rem] bg-black/20 p-1.5 ring-1 ring-white/25 backdrop-blur-md sm:top-6 sm:right-6"
      >
        {SLIDES.map((s, n) => (
          <button
            key={s.src}
            type="button"
            aria-label={s.alt}
            aria-pressed={n === i}
            onClick={() => setI(n)}
            onPointerEnter={() => setI(n)}
            className={cn(
              "relative h-10 w-14 overflow-hidden rounded-xl shadow-lg shadow-black/25 ring-2 transition-[transform,opacity,box-shadow] duration-200 outline-none focus-visible:ring-white motion-reduce:transition-none",
              n === i ? "z-10 scale-110 opacity-100 ring-white" : "opacity-75 ring-white/40 hover:scale-105 hover:opacity-100 hover:ring-white/80",
            )}
          >
            <Image src={s.src} alt="" fill unoptimized sizes="56px" className="object-cover" style={{ objectPosition: s.position }} />
          </button>
        ))}
      </div>
    </>
  );
}
