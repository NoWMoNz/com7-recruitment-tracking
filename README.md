# Com7 Recruitment Tracking

ระบบติดตามการสรรหาพนักงาน: ดูว่าแต่ละสาขาขาดคนตำแหน่งไหน นับ TAT (วันที่แจ้งสรรหา → วันที่ Offer) อัตโนมัติ
และบอก Meet / Not Meet ใช้ Google Sheet เป็นที่เก็บข้อมูลหลัก deploy บน Vercel

- เอกสารออกแบบ: [docs/superpowers/specs/2026-11-17-recruitment-tracking-design.md](docs/superpowers/specs/2026-11-17-recruitment-tracking-design.md)
- สถานะ: **Phase 1** — ล็อกอิน + หน้า Tracking (ดูอย่างเดียว)

## ลองรันในเครื่อง (ไม่ต้องมี Google)

ต้องมี Node 20+ และ pnpm

```bash
pnpm install
cp .env.example .env.local      # แล้วใส่ AUTH_SECRET (สุ่มด้วย: npx auth secret)
pnpm dev
```

เปิด http://localhost:3000 แล้วใช้ "เข้าสู่ระบบแบบทดสอบ" ด้วยอีเมลตัวอย่าง:

| อีเมล | บทบาท |
|---|---|
| `ju@example.com` | ผู้ดูแลระบบ (super_admin) |
| `mind@example.com`, `ploy@example.com` | TA |
| `boss@example.com` | ผู้ดูรายงาน (ทุกภาค) |
| `north@example.com` | ผู้ดูรายงาน (เฉพาะภาคเหนือ) |

ข้อมูลตัวอย่างอยู่ใน `src/lib/repo/fixtures.ts` (สมมติว่าวันนี้คือ 17/11/2026) และจะรีเซ็ตทุกครั้งที่รีสตาร์ต

## คำสั่งที่ใช้บ่อย

| คำสั่ง | ทำอะไร |
|---|---|
| `pnpm test` | รัน unit test |
| `pnpm lint` | ตรวจโค้ด |
| `pnpm build` | build สำหรับ production |
| `pnpm sheet:setup [admin@email]` | สร้าง/อัปเดตโครง Google Sheet (รันซ้ำได้) |
| `pnpm sheet:seed` | ใส่ข้อมูลตัวอย่างลง **Sheet ทดสอบ** เท่านั้น |

## ต่อกับ Google Sheet จริง

1. **Google Cloud project** — ไปที่ https://console.cloud.google.com สร้าง project แล้วเปิด **Google Sheets API**
2. **Service account** — IAM & Admin → Service Accounts → Create → เข้าไปที่ Keys → Add key → JSON
   - เอา `client_email` ใส่ `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - เอา `private_key` ใส่ `GOOGLE_PRIVATE_KEY` (ใส่ทั้งก้อน รวม `\n`)
3. **สร้าง Google Sheet เปล่า** แล้วกด Share ให้อีเมล service account เป็น **Editor**
   เอา ID จาก URL (`/spreadsheets/d/<ID>/edit`) ใส่ `SHEET_ID`
4. **OAuth สำหรับล็อกอิน** — APIs & Services → Credentials → Create OAuth client ID → Web application
   - Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google` และ `https://<โดเมนบน Vercel>/api/auth/callback/google`
   - ใส่ค่าใน `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`
5. ตั้ง `DATA_SOURCE=sheets` ใน `.env.local` แล้วรัน
   ```bash
   pnpm sheet:setup your.email@company.com
   ```
   ระบบจะสร้างแท็บทั้งหมด หัวคอลัมน์ รูปแบบวันที่ dd/mm/yyyy ค่า Settings เริ่มต้น และเพิ่มอีเมลนี้เป็นผู้ดูแลระบบคนแรก
6. เพิ่มผู้ใช้คนอื่นในแท็บ `Users` (email, name, role = `super_admin` / `ta` / `viewer`, scope ว่าง = เห็นทุกภาค, active = TRUE)

> แท็บที่ระบบดูแล (Requisitions, Offers, StatusLog ฯลฯ) ถูกตั้งเป็น "เตือนก่อนแก้" — แก้ได้ แต่ควรแก้ผ่านเว็บ
> หลังแก้ Sheet ตรงๆ กดปุ่ม **รีเฟรชข้อมูล** บนเว็บ (ไม่งั้นรอไม่เกิน ~1 นาที)

## Deploy บน Vercel

- ใช้งานในบริษัทควรใช้แผน **Pro** (แผน Hobby ห้ามใช้เชิงพาณิชย์)
- ตั้ง Environment Variables: `DATA_SOURCE=sheets`, `SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`,
  `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` (**ห้าม** ตั้ง `AUTH_DEV_LOGIN` บน production — และถึงตั้งไว้ระบบก็ไม่เปิดให้)
- Preview deployment ควรชี้ไปที่ Sheet ทดสอบ ไม่ใช่ Sheet จริง

## โครงสร้างโค้ด

```
src/lib/domain/   กติกาธุรกิจ (วันที่, TAT, aging, สิทธิ์, หน้า tracking) — pure function มี test
src/lib/sheets/   โครงแท็บ + การแปลงแถว Sheet ↔ object
src/lib/repo/     ชั้นอ่าน/เขียนข้อมูล: MemoryRepo (ตัวอย่าง) / SheetsRepo (Google Sheets)
src/app/          หน้าเว็บ (Next.js App Router)
scripts/          setup / seed Google Sheet
tests/            unit test (Vitest)
```
