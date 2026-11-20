import type { Metadata } from "next";
import { Noto_Sans, Noto_Sans_Thai } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Noto Sans everywhere (body, headings, numbers). Latin comes from Noto Sans and Thai from its Thai companion,
// which the browser falls back to per glyph, so the two always match in weight and width. Variable fonts: every weight, one file each.
const notoSans = Noto_Sans({ variable: "--font-noto", subsets: ["latin", "latin-ext"] });
const notoThai = Noto_Sans_Thai({ variable: "--font-noto-thai", subsets: ["thai"] });

export const metadata: Metadata = {
  title: "Recruitment Tracking",
  description: "ระบบติดตามการสรรหาพนักงาน",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${notoSans.variable} ${notoThai.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
