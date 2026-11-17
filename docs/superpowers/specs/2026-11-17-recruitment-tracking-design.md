# Com7 Recruitment Tracking System — Design

วันที่: 17/11/2026
สถานะ: ร่าง รออนุมัติ

> เครื่องหมาย **[ข้อเสนอ]** = ผู้ออกแบบตัดสินใจแทน เพราะยังไม่มีข้อมูลจากผู้ใช้ ตรวจและแก้ได้
> เครื่องหมาย **[ต้องยืนยัน]** = ต้องถามพี่/จู ก่อนใช้งานจริง (ระบบตั้งค่าเริ่มต้นไว้ให้ก่อน)

---

## 1. ทำไมต้องมีระบบนี้

ทีม TA ต้องรู้ว่าแต่ละสาขาขาดคนกี่คน ตำแหน่งอะไร แต่ละตำแหน่งเปิดมากี่วันแล้ว และ TA แต่ละคนปิดงานได้แค่ไหน
ทุกวันนี้ยังไม่มีเครื่องมือกลาง ระบบนี้จะเป็นที่เดียวที่:

- TA เห็นงานของตัวเองและกรอก Offer ได้จากหน้าเดียว
- ทุกตำแหน่งนับ **TAT** (วันที่แจ้งสรรหา → วันที่ Offer) อัตโนมัติ และบอกว่า **Meet / Not Meet**
- หัวหน้าเห็น dashboard สรุปราย TA, aging ของ vacancy และ report รายสัปดาห์/รายเดือน
- **จู** (Super Admin) คุมข้อมูลหลัก อนุมัติ Cancel/Hold และวางข้อมูลจาก HR (ลาออก/โอนย้าย/พนักงานใหม่) ผ่าน Google Sheet ได้ตามที่คุ้นเคย

## 2. Goals / Non-goals / Anti-goals

**Goals**
- ติดตาม vacancy รายตำแหน่ง/สาขา พร้อม TAT และ aging แบบ real-time
- บันทึก Offer / Turndown / Cancel / Hold ผ่านเว็บ พร้อมกติกาย้อนหลังและการอนุมัติ
- สรุปผลราย TA ต่อเดือน, aging, TAT Meet %, weekly hired report และ export เป็น Excel ได้
- Google Sheet เป็นที่เก็บข้อมูลหลัก จูเปิดดูและวางข้อมูลเองได้

**Non-goals (v1 ไม่ทำ)**
- ไม่ติดตามขั้นตอนก่อน Offer (สมัคร/สัมภาษณ์/candidate pipeline)
- ไม่เชื่อมระบบ HR อัตโนมัติ ใช้วิธีวางข้อมูลลง Sheet แทน
- ไม่มีแจ้งเตือนทาง email/LINE
- ไม่รองรับภาษาอื่นนอกจากภาษาไทย

**Anti-goals (ถ้าเกิดขึ้นถือว่าล้มเหลว แม้ระบบจะทำงานได้)**
- ตัวเลขใน dashboard ไม่ตรงกับข้อมูลใน Sheet หรือแต่ละหน้าเห็นตัวเลขไม่ตรงกัน
- TA แก้วันที่แจ้งสรรหาได้ หรือ vacancy หายไปโดยที่จูยังไม่อนุมัติ
- จูแก้ หรือเรียง Sheet แล้วระบบเขียนข้อมูลผิดแถว
- ข้อมูลหายหรือถูกเขียนทับเมื่อสองคนบันทึกพร้อมกันโดยไม่มีใครรู้

## 3. Constraints

- Hosting: **Vercel** / Data: **Google Sheets** (ตามบรีฟ)
- Google Sheets API มีโควตาการอ่านเขียนต่อนาที และไม่มี transaction
- จูอาจแก้ Sheet ตรงๆ (เพิ่มแถว ลบแถว เรียงลำดับ) ระบบต้องไม่พังเพราะเรื่องนี้
- Timezone **Asia/Bangkok**, แสดงวันที่เป็น **dd/mm/yyyy (ค.ศ.)** [ข้อเสนอ: ใช้ ค.ศ.]
- UI ภาษาไทย ใช้บนมือถือได้
- ยังไม่มี Sheet เดิม ระบบเป็นคนสร้างโครง Sheet ให้

## 4. Approaches (ทางเลือกที่พิจารณา)

| ทางเลือก | สรุป | ข้อดี | ข้อเสีย |
|---|---|---|---|
| **1. Google Sheet เป็น DB หลัก** ✅ เลือก | Next.js บน Vercel อ่านเขียน Sheet ตรงผ่าน service account | ตรงบรีฟ, จูแก้ Sheet เองได้, ฟรี, ไม่ต้องสอนใหม่ | เสี่ยงบันทึกทับกัน, มีโควตา API → แก้ด้วย version check + cache |
| 2. Supabase + sync ออก Sheet | DB จริงเป็นหลัก, Sheet เป็นสำเนา | แข็งแรง เร็ว มี storage และ auth ในตัว | sync สองทางซับซ้อน, ไม่ตรงบรีฟ, อาจมีค่าใช้จ่าย |
| 3. Google Apps Script | เว็บแอปที่รันใน Google | ง่าย ฟรี มี login ในตัว | UI จำกัด ช้า ดูแลยาก, ไม่ตรงบรีฟ |

**เหตุผลที่เลือกทางเลือกที่ 1:** ตรงกับที่พี่ต้องการ และจูยังคุมข้อมูลใน Sheet ได้ ส่วนความเสี่ยงที่เหลือป้องกันได้ด้วยการออกแบบ (ข้อ 9)
ชั้นที่อ่านเขียนข้อมูลจะแยกเป็น repository interface เพื่อให้ย้ายไป Supabase ได้ภายหลังโดยไม่ต้องรื้อ UI

## 5. ผู้ใช้และสิทธิ์

| Role | ทำอะไรได้ |
|---|---|
| **super_admin** (จู, มีได้หลายคน) | ทุกอย่าง: แก้วันที่แจ้งสรรหา, อนุมัติ/ไม่อนุมัติ Cancel/Hold, เพิ่มสาขา/ร้านเปิด/ร้านปิด/Project, กด "ประมวลผลข้อมูล", จัดการผู้ใช้และ master data, ลงวันที่ย้อนหลังเกิน 3 วันได้ |
| **ta** | เห็น tracking ทั้งหมด แต่**แก้ได้เฉพาะตำแหน่งที่ตัวเองรับผิดชอบ**: กรอก Offer, Turndown, ขอ Cancel/Hold, Resume จาก Hold; ดู dashboard/report ได้ [ข้อเสนอ] |
| **viewer** | ดู dashboard และ report อย่างเดียว |

- Login ด้วย Google (Auth.js) เข้าได้เฉพาะอีเมลที่อยู่ในแท็บ `Users` และ `active = TRUE`
  เขียนให้เปลี่ยนเป็น Microsoft (Entra ID) ได้ถ้าบริษัทไม่ได้ใช้ Google [ข้อเสนอ]
- หน้า "กำหนดสิทธิ์" ให้ super_admin เพิ่ม/ปิดผู้ใช้และเปลี่ยน role
- **ขอบเขตการมองเห็น:** `Users.scope` ว่าง = เห็นทั้งหมด หรือใส่รายชื่อภาคหรือรหัสสาขา (คั่นด้วย `,`) เพื่อจำกัดให้ viewer/ta เห็นเฉพาะพื้นที่ของตัวเอง ใช้กรองทุกหน้า ทุก report และทุก export [ข้อเสนอ]

## 6. แนวคิดหลัก: Requisition (1 แถว = 1 อัตราที่ต้องสรรหา)

- **Requisition** คือคำขอสรรหา 1 อัตรา ใน 1 รอบ ของตำแหน่ง X ที่สาขา Y
- ถ้าสาขาต้องการ 3 คนในตำแหน่งเดียวกัน = 3 requisition แยกกัน แต่ละแถวมี TAT และคน Offer ของตัวเอง [ข้อเสนอ]
- วันที่แจ้งสรรหา (`request_date`) อยู่ที่ requisition และไม่เปลี่ยนตลอดอายุ ยกเว้น super_admin แก้ (มี log)
- Requisition ปิดเมื่อ Hired / Transfer-in / Cancel อนุมัติ ถ้าภายหลังคนนั้นลาออก จะได้ requisition **ใหม่**

### Status

| Status | ความหมาย | นับเป็น vacancy? | อยู่หน้า Tracking? | TAT นับต่อ? |
|---|---|---|---|---|
| `Vacancy` | ว่าง กำลังหา | ✅ | ✅ | ✅ |
| `Offer` | มีคน Offer แล้ว รอเข้างาน | ✅ (ยังไม่ปิด) | ✅ | ❌ หยุดที่วันที่ Offer |
| `PendingCancel` / `PendingHold` | TA ขอ Cancel/Hold รอจูอนุมัติ | ✅ | ✅ | ✅ |
| `Hold` | จูอนุมัติพักไว้ | ❌ | ❌ (มีแท็บ Hold แยก) | ❌ หยุดนับ |
| `Cancel` | จูอนุมัติยกเลิก / ร้านปิด | ❌ | ❌ | — |
| `Hired` | ได้พนักงานแล้ว (match กับข้อมูล HR) | ❌ | ❌ | — |
| `Transfer` | ปิดด้วยการโอนย้ายพนักงานภายในเข้ามา | ❌ | ❌ | — |

ข้อบังคับ:
- "On process" (แสดงในหน้า Tracking) = `Vacancy`, `Offer`, `PendingCancel`, `PendingHold`
- **"Vacancy คงเหลือ" (open) = ทุก requisition ที่ยังไม่ปิดและไม่ Hold** (รวม Offer, เพราะยังไม่ได้คนเข้างานจริง)

### การเปลี่ยนสถานะที่อนุญาต

| จาก → ไป | ใครทำ | เงื่อนไข |
|---|---|---|
| (สร้าง) → Vacancy | ระบบ / super_admin | ร้านเปิด, Project, ลาออก, โอนย้ายออก, เพิ่มอัตรา |
| Vacancy → Offer | ta เจ้าของ / super_admin | กรอก pop-up Offer, วันที่ Offer ย้อนได้ ≤ 3 วัน |
| Offer → Vacancy (Turndown) | ta เจ้าของ / super_admin | ย้ายข้อมูลคนไป `Turndowns`, ใช้ `request_date` เดิม |
| Offer → Hired | ระบบ (ประมวลผลข้อมูล) | match กับ `Import_NewEmployee` |
| Vacancy → PendingCancel / PendingHold | ta เจ้าของ / super_admin | **บังคับแนบรูป** + เหตุผล + วันที่ (ย้อนได้ ≤ 3 วัน) |
| Pending* → Cancel / Hold | super_admin | กดอนุมัติ |
| Pending* → Vacancy | super_admin | กดไม่อนุมัติ (ต้องใส่เหตุผล) |
| Hold → Vacancy (Resume) | ta เจ้าของ / super_admin | TAT/aging นับต่อจากเดิม ไม่รวมช่วง Hold [ข้อเสนอ] |
| Vacancy/Offer/Pending* → Cancel | ระบบ | ร้านปิด: ถึงวันที่ปิดร้าน ไม่ต้องอนุมัติเพราะจูเป็นคนใส่วันปิด |
| Vacancy/Pending* → Transfer | ระบบ | ถึงวันที่มีผลของการโอนย้ายเข้า |

- ขอ Cancel/Hold ได้เฉพาะตอนเป็น `Vacancy` ถ้าเป็น `Offer` ต้อง Turndown ก่อน [ข้อเสนอ]
- ทุกการเปลี่ยนสถานะเขียนลง `StatusLog` เสมอ

## 7. Business rules

1. **ร้านเปิด / Project / เพิ่มอัตรา:** super_admin เพิ่มผ่านเว็บ (หรือวางในแท็บ `Import_Requisition`) ระบุสาขา ตำแหน่ง จำนวนอัตรา และวันที่แจ้งสรรหา (default = วันนี้) → สร้าง requisition เป็น `Vacancy` ทันที
2. **ลาออก:** จูวางข้อมูลในแท็บ `Import_Resign` → เมื่อกด "ประมวลผลข้อมูล" หรือ cron รอบกลางคืน → สร้าง requisition ที่ `request_date` = วันที่มีผลลาออก
   - ถ้าวันที่มีผลยังไม่ถึง: requisition ขึ้นในหน้า Tracking พร้อมป้าย "ว่างวันที่ dd/mm/yyyy" แต่**ยังไม่นับเป็น vacancy** และ TAT = 0 จนกว่าจะถึงวัน; TA เริ่มหาและ Offer ล่วงหน้าได้ [ข้อเสนอ]
3. **โอนย้าย (Transfer):** จูวางข้อมูลในแท็บ `Import_Transfer` (รหัสพนักงาน, ชื่อ, สาขา/ตำแหน่งต้นทาง, สาขา/ตำแหน่งปลายทาง, วันที่มีผล) เมื่อถึงวันที่มีผล:
   - **ปลายทาง:** requisition `Vacancy` ที่เก่าที่สุดของสาขา+ตำแหน่งนั้นถูกปิดเป็น `Transfer` ก่อนถึงวันที่มีผลยังเป็น vacancy อยู่ ถ้าไม่มี requisition ให้ปิด → ขึ้นรายการ "ต้องตรวจ" ให้จู
   - **ต้นทาง:** สร้าง requisition ใหม่ที่ `request_date` = วันที่มีผล (เหมือนลาออก) [ต้องยืนยัน: การโอนออกทำให้เกิด vacancy ที่ต้นทางด้วยใช่ไหม]
4. **ร้านปิด:** จูใส่ `close_date` ในแท็บ `Branches` → เมื่อถึงวันนั้น requisition ที่ยังเปิดของสาขานั้นถูก `Cancel` อัตโนมัติ (เหตุผล "ร้านปิด") ถ้ามีคนที่ Offer ค้างอยู่ ให้ขึ้นรายการ "ต้องตรวจ" ให้จูตัดสินใจ
5. **Recruiter ประจำตำแหน่ง:** แท็บ `RecruiterAssignments` ผูก TA กับ (สาขา, กลุ่มตำแหน่ง) ตอนสร้าง requisition ระบบใส่ `ta_email` ตามที่ผูกไว้ (เลือกจาก match ที่เจาะจงที่สุด: สาขา+ตำแหน่ง > สาขา) ถ้าไม่พบ → "ยังไม่มีเจ้าของ" ให้จู assign ได้ภายหลังผ่านเว็บ
6. **วันที่แจ้งสรรหา:** แก้ได้เฉพาะ super_admin ผ่านเว็บ และบันทึกค่าเดิม/ค่าใหม่ลง log
7. **ย้อนหลัง:** วันที่ของ Offer / Turndown / Cancel / Hold / Resume ต้องอยู่ในช่วง **วันนี้ − 3 วัน ถึงวันนี้** (ห้ามลงวันที่อนาคต) ตรวจทั้งฝั่งหน้าเว็บและฝั่ง server; super_admin ไม่ติดกติกานี้ [ข้อเสนอ: ใช้กับ Turndown/Resume ด้วยเพื่อให้เหมือนกัน]
8. **Offer pop-up:** หัวแสดง ตำแหน่ง / สาขา / TAT / จังหวัด / ภาค ช่องกรอก:
   คำนำหน้า (นาย/นาง/นางสาว) [ข้อเสนอ: เพิ่ม "นาง"], ชื่อ, นามสกุล (แยกช่องเพื่อให้ match ได้แม่น), วันที่ Offer (date picker dd/mm/yyyy), Sourcing Channel (dropdown ค้นหาได้, จาก `SourcingChannels`), เบอร์โทร (ไม่บังคับ) [ข้อเสนอ]
   แสดง TAT ณ วันที่ Offer ที่เลือก และป้าย Meet/Not Meet แบบ live
9. **Turndown:** ย้ายข้อมูลคนนั้นจาก `Offers` ไป `Turndowns` (พร้อมวันที่และเหตุผล) requisition กลับเป็น `Vacancy` ใช้ `request_date` เดิม TAT นับต่อจากวันที่แจ้งสรรหาเดิม
10. **Hired:** จูวางข้อมูลพนักงานใหม่ (รหัสพนักงาน, คำนำหน้า, ชื่อ, นามสกุล, สาขา, ตำแหน่ง, วันที่เริ่มงาน) ในแท็บ `Import_NewEmployee` → กด "ประมวลผลข้อมูล" → ระบบ match กับ `Offers`:
    - key = ชื่อ + นามสกุล (ตัดช่องว่างเกิน/คำนำหน้าออก) + สาขา + ตำแหน่ง [ข้อเสนอ]
    - match ได้ 1 รายการ → ดึงรหัสพนักงาน + วันที่เริ่มงาน → requisition เป็น `Hired`, `hired_at` = วันที่ประมวลผล → ย้ายข้อมูลครบชุดไปแท็บ `NewHires` และลบออกจาก `Offers`
    - ไม่เจอ หรือเจอมากกว่า 1 → ขึ้นรายการ "รอจับคู่" ให้จูเลือกคู่เองในเว็บ
    - แถวใน `Import_NewEmployee` ที่ประมวลผลแล้วจะถูกทำเครื่องหมาย `processed_at` (ไม่ลบ)
11. **Audit log:** ทุกการเปลี่ยนแปลงลง `StatusLog` (ใคร, เมื่อไร, จาก→ไป, วันที่ที่ลง, หมายเหตุ, ลิงก์รูป)
    รวมถึงการเปลี่ยน TA เจ้าของ (`to_status = OwnerChange`, note = เจ้าของเดิม→ใหม่) และการแก้วันที่แจ้งสรรหา
12. **ข้อมูลตั้งต้นวันเปิดใช้ (Go-live import):** super_admin วางตำแหน่งที่เปิดอยู่จริงลงแท็บ `Import_Initial`
    (สาขา, ตำแหน่ง, วันที่แจ้งสรรหาจริง, TA, สถานะปัจจุบัน Vacancy/Offer/Hold, ข้อมูลคน Offer ถ้ามี, วันที่เริ่ม Hold ถ้ามี)
    → ระบบสร้าง requisition + Offer + StatusLog ย้อนหลังตามวันที่จริง **ไม่ผ่านกติกาย้อนหลัง 3 วันและขั้นอนุมัติ** (ใช้ได้เฉพาะ super_admin)
    ตัวเลข "ยกมา" ของเดือนแรกจะถูกต้องตั้งแต่วันเปิดใช้; ไม่ import ประวัติที่ปิดไปแล้ว (Hired/Turndown/Cancel ในอดีต) [ข้อเสนอ]
13. **เครดิตใน report:** ยอดของแต่ละเดือนนับให้ TA ที่เป็นเจ้าของ requisition **ณ วันที่เกิดเหตุการณ์** (ดูจาก OwnerChange ใน log) ไม่ใช่เจ้าของปัจจุบัน [ข้อเสนอ]

## 8. การคำนวณ

ทั้งหมดเป็น **pure function** ใน `lib/domain/` มี unit test ครบ และคำนวณจาก `Requisitions` + `StatusLog`

- **นับวัน:** นับวันตามปฏิทิน ใช้วันที่ตามเวลา Bangkok วันเดียวกัน = 0
- **Hold days:** ผลรวมช่วงเวลาที่ requisition อยู่สถานะ `Hold` (จาก log)
- **TAT** = (วันที่ Offer ถ้ามี ไม่งั้นวันนี้) − `request_date` − hold days (ขั้นต่ำ 0)
  - ถ้า Turndown แล้ว Offer ใหม่ ใช้วันที่ Offer **ครั้งล่าสุด**
- **TAT result:**
  - มี Offer แล้ว → `Meet` ถ้า TAT ≤ SLA, ไม่งั้น `Not Meet`
  - ยังไม่ Offer → `Not Meet` ถ้า TAT > SLA แล้ว, ไม่งั้น `กำลังดำเนินการ` [ข้อเสนอ]
  - SLA ตั้งในแท็บ `Settings` เป็นค่า default + แยกตามตำแหน่งได้ **ค่าเริ่มต้น 30 วัน [ต้องยืนยัน]**
- **Aging** (เฉพาะ vacancy ที่เปิดอยู่) = วันนี้ − `request_date` − hold days
  - 0–30 🟢 เขียว / 31–60 🟠 ส้ม / 61–90 🔴 แดง / **90+ แดงเข้ม** [ข้อเสนอ] ช่วงตั้งค่าได้ใน `Settings`
- **ตัดรอบรายเดือน (เดือน M ตามปฏิทิน)** ต่อ TA:
  - **ยกมา** = open ณ วันแรกของ M
  - **เข้าใหม่** = requisition ที่ `request_date` อยู่ใน M (Turndown ไม่นับเป็นเข้าใหม่ เพราะเป็น requisition เดิม)
  - **ถือทั้งหมด** = ยกมา + เข้าใหม่
  - **ปิดได้** = Hired (`hired_at` ใน M) + Transfer (วันที่มีผลใน M) [ข้อเสนอ: นับตอน Hired ไม่ใช่ตอน Offer]
  - **Cancel / Hold** = ที่อนุมัติโดยมีวันที่มีผลใน M
  - **Offer ค้าง** = สถานะ Offer ณ สิ้นเดือน (แสดงแยก)
  - **คงเหลือ** = open ณ สิ้นเดือน (หรือ ณ วันนี้ถ้าเป็นเดือนปัจจุบัน)
  - **ปิดงวด:** วันที่ 1 ของเดือนถัดไป Processor บันทึกผลของเดือนที่จบไปแล้วลงแท็บ `MonthlySnapshots` หลังจากนั้น report ของเดือนเก่าอ่านจาก snapshot ตัวเลขที่รายงานไปแล้วจึงไม่เปลี่ยน super_admin กด "คำนวณงวดนี้ใหม่" ได้ถ้าต้องแก้ย้อนหลัง [ข้อเสนอ]
- **Weekly report:** สัปดาห์ จันทร์–อาทิตย์ นับ Hired ตาม `hired_at` (วันที่เปลี่ยน Offer → Hired) แยกตาม TA / ภาค / ตำแหน่ง / sourcing channel พร้อม TAT เฉลี่ยและ Meet %

## 9. สถาปัตยกรรม

```
Browser ──► Next.js (App Router, Vercel)
              ├─ Server Components: อ่านผ่าน cache
              ├─ Server Actions: เขียน (ตรวจสิทธิ์ + validate + version check)
              ├─ lib/domain/*      pure logic (TAT, aging, transitions, monthly)
              ├─ lib/repo/*        interface อ่าน/เขียน  ──► Google Sheets API (service account)
              ├─ Vercel Blob       รูปหลักฐาน Cancel/Hold
              └─ Vercel Cron       ประมวลผลรายวัน 00:30 น. (Bangkok)
Auth.js (Google) ── allowlist จากแท็บ Users
```

- **Stack:** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui, `googleapis`, Auth.js (Google provider), Vercel Blob, Vitest, ใช้ `exceljs` หรือ SheetJS สำหรับ export
- **ID ไม่ใช้เลขแถว:** ทุกแท็บที่ระบบดูแลมีคอลัมน์ `id` (เช่น `REQ-000123`) เวลาเขียนจะอ่านคอลัมน์ `id` สดๆ เพื่อหาเลขแถวปัจจุบันก่อนเขียนทุกครั้ง → จูจะเรียงหรือแทรกแถวก็ไม่ทำให้ระบบเขียนผิดแถว
- **กันบันทึกทับกัน:** แต่ละแถวมี `version` ก่อนเขียนจะตรวจว่า `version` ยังตรงกับตอนที่ผู้ใช้เปิดดู ถ้าไม่ตรง → แจ้ง "ข้อมูลถูกแก้โดยคนอื่น กรุณาโหลดใหม่" เขียนแล้ว `version + 1`
- **Cache:** การอ่านทั้งหมดผ่าน cache ~60 วินาที (tag ตามแท็บ) การเขียนผ่านเว็บจะล้าง cache ทันที และมีปุ่ม "รีเฟรชข้อมูล" สำหรับกรณีจูแก้ Sheet ตรง
- **การเขียนแบบ batch:** ใช้ `batchUpdate`/`append` ให้ 1 action = จำนวน API call น้อยที่สุด
- **งานประมวลผล (Processor):** ฟังก์ชันเดียวที่ idempotent (รันซ้ำได้ผลเหมือนเดิม) ทำ: Resign → requisition, Transfer ที่ถึงวัน, ร้านปิดที่ถึงวัน, match พนักงานใหม่ เรียกจาก cron ทุกคืน และจากปุ่ม "ประมวลผลข้อมูล" ของจู ผลลัพธ์แสดงเป็นสรุป (สร้างกี่รายการ / ปิดกี่รายการ / ต้องตรวจกี่รายการ)
- **รูปหลักฐาน:** อัปโหลดไป Vercel Blob (บีบอัดฝั่ง browser, ≤ 5MB, jpg/png/webp/heic) เก็บ URL ใน `Approvals` การป้องกันการเข้าถึง (private หรือ URL ที่เดายาก) ให้ builder เลือก
- **วันที่ใน Sheet:** เก็บเป็นค่าวันที่จริงของ Sheets และจัดรูปแบบ dd/mm/yyyy ให้จูอ่านง่าย ฝั่งระบบอ่านเป็นค่าดิบแล้วแปลง
- **ขนาดข้อมูล:** ออกแบบสำหรับ requisition ที่เปิดพร้อมกันได้ถึงประมาณ 3,000 รายการ และผู้ใช้พร้อมกันประมาณ 50 คน
  requisition ที่ปิดไปเกิน 3 เดือน พร้อม log ของมัน ถูกย้ายไป `Requisitions_Archive` / `StatusLog_Archive` ทุกเดือนโดย Processor
  การอ่านปกติจึงใช้แค่ข้อมูลที่ยัง active และ report เก่าใช้ `MonthlySnapshots` [ข้อเสนอ]
- **Hosting:** ใช้ในบริษัทจึงควรใช้ Vercel **Pro** (แผน Hobby ห้ามใช้เชิงพาณิชย์) cron 1 ครั้งต่อวันพอ
- **Secrets:** service account JSON, Sheet ID, Google OAuth, Blob token เก็บเป็น env ของ Vercel
- **Sheet ทดสอบ:** มี Sheet แยกสำหรับ dev/preview ห้ามชี้ไปที่ Sheet จริง

## 10. โครง Google Sheet

ระบบมีสคริปต์ `setup-sheet` สร้างแท็บ หัวคอลัมน์ รูปแบบวันที่ dropdown validation และ protected range (โหมดเตือน) ให้อัตโนมัติ

**Master (จู/admin แก้ได้ ทั้งในเว็บและใน Sheet)**
| แท็บ | คอลัมน์หลัก |
|---|---|
| `Branches` | branch_code, branch_name, brand, province, region, status (Open/Closed/Project), open_date, close_date |
| `Positions` | position_code, position_name, position_group, sla_days (ว่าง = ใช้ default) |
| `SourcingChannels` | channel, active |
| `RecruiterAssignments` | branch_code, position_group (ว่าง = ทุกตำแหน่ง), ta_email |
| `Users` | email, name, role, scope, active |
| `Settings` | key, value (เช่น default_sla_days=30, aging_bands, backdate_days=3) |

**Import (จูวางข้อมูลจาก HR)**
| แท็บ | คอลัมน์หลัก |
|---|---|
| `Import_Requisition` | branch_code, position_code, headcount, request_date, source (NewStore/Project/Additional), note, processed_at |
| `Import_Initial` | branch_code, position_code, request_date, ta_email, status, title, first_name, last_name, offer_date, sourcing_channel, hold_since, processed_at |
| `Import_Resign` | employee_id, title, first_name, last_name, branch_code, position_code, effective_date, processed_at |
| `Import_Transfer` | employee_id, title, first_name, last_name, from_branch, from_position, to_branch, to_position, effective_date, processed_at |

ทุกแท็บ Import ใช้หัวคอลัมน์คงที่ตามนี้ จูต้องวางข้อมูลให้ตรงคอลัมน์ ถ้าไฟล์ HR เรียงคอลัมน์ไม่เหมือนกัน จะทำชั้นแปลงคอลัมน์ทีหลัง เมื่อได้ไฟล์ตัวอย่างจริง [ข้อเสนอ]
ระบบตรวจทุกแถวก่อนประมวลผล (รหัสสาขา/ตำแหน่งมีอยู่จริง, วันที่ถูกต้อง, รองรับปี พ.ศ. ที่มากกว่า 2400 โดยแปลงเป็น ค.ศ.) แถวที่ผิดจะถูกข้ามและแสดงเหตุผล
| `Import_NewEmployee` | employee_id, title, first_name, last_name, branch_code, position_code, start_date, processed_at, matched_req_id |

**ระบบดูแล (protected แบบเตือน ไม่ควรแก้ตรง)**
| แท็บ | คอลัมน์หลัก |
|---|---|
| `Requisitions` | id, branch_code, position_code, request_date, source, source_ref, ta_email, status, status_date, offer_id, closed_at, version, created_at, updated_at |
| `Offers` | id, req_id, title, first_name, last_name, phone, offer_date, sourcing_channel, tat_at_offer, ta_email, created_by, created_at |
| `NewHires` | (ข้อมูล Offer ทั้งหมด) + employee_id, start_date, hired_at, tat, tat_result |
| `Turndowns` | (ข้อมูล Offer ทั้งหมด) + turndown_date, reason, recorded_by |
| `Approvals` | id, req_id, type (Cancel/Hold), reason, effective_date, evidence_url, requested_by, requested_at, status (Pending/Approved/Rejected), decided_by, decided_at, decision_note |
| `StatusLog` | id, req_id, from_status, to_status, effective_date, actor, at, note, ref_id |
| `ReviewQueue` | id, type (UnmatchedHire/TransferNoReq/OfferAtClosedStore/...), ref, detail, resolved_by, resolved_at |
| `MonthlySnapshots` | month, ta_email, region, carried_in, new, total, closed, cancel, hold, offer_pending, remaining, tat_meet, tat_total, computed_at |
| `Requisitions_Archive` / `StatusLog_Archive` | คอลัมน์เหมือนแท็บต้นฉบับ |

ข้อมูลอ้างอิงที่ต้องแสดง (สาขา จังหวัด ภาค) join จาก `Branches` ตอนอ่าน ไม่คัดลอกลง `Requisitions`

## 11. หน้าเว็บ

1. **Dashboard** — filter: เดือน / ภาค / จังหวัด / สาขา / ตำแหน่ง / TA
   - การ์ดสรุป: open vacancy, offer ค้าง, hired เดือนนี้, TAT Meet %
   - ตารางราย TA: ยกมา / เข้าใหม่ / ถือทั้งหมด / ปิดได้ / Cancel / Hold / Offer ค้าง / คงเหลือ
   - Aging: แถบจำนวนตามกลุ่มสี (คลิกแล้วไปหน้า Tracking ที่ filter ไว้แล้ว)
   - TAT Meet / Not Meet แยกตาม TA และตำแหน่ง
2. **Tracking** — ค่าเริ่มต้นแสดงเฉพาะ "ของฉัน" (TA) หรือทั้งหมด (admin) จัดกลุ่มตาม ภาค → สาขา แต่ละแถวคือ requisition: ตำแหน่ง, วันที่แจ้งสรรหา, TAT, ป้ายสี aging, สถานะ, TA
   - คลิก `Vacancy` → pop-up Offer / ปุ่มขอ Cancel / Hold
   - คลิก `Offer` → ดูข้อมูลคน / ปุ่ม Turndown
   - มือถือ: แสดงเป็นการ์ดแทนตาราง
   ```
   ภาคกลาง ▸ BKK-012 สาขาเซ็นทรัลลาดพร้าว
   ┌───────────────┬────────────┬─────┬────────┬─────────┐
   │ ตำแหน่ง        │ แจ้งสรรหา   │ TAT │ สถานะ   │ TA      │
   ├───────────────┼────────────┼─────┼────────┼─────────┤
   │ Sales         │ 02/10/2026 │ 46🟠│ Vacancy│ มายด์    │
   │ Sales         │ 28/10/2026 │ 20🟢│ Offer  │ มายด์    │
   │ Store Manager │ 01/08/2026 │ 108⬛│ Pending│ บอส     │
   └───────────────┴────────────┴─────┴────────┴─────────┘
   ```
3. **Hold** — รายการที่ Hold อยู่ พร้อมปุ่ม Resume
4. **อนุมัติ** (super_admin) — รายการ Pending พร้อมรูปหลักฐาน ปุ่มอนุมัติ / ไม่อนุมัติ (ต้องใส่เหตุผล)
5. **ประมวลผลข้อมูล** (super_admin) — ปุ่ม "ประมวลผลตอนนี้" + สรุปผล + `ReviewQueue` (รอจับคู่พนักงานใหม่ ฯลฯ)
6. **Reports** — Weekly (Hired) / Monthly (ราย TA) / รายการ Turndown / ประวัติของแต่ละ requisition (จาก StatusLog) export เป็น Excel ได้ทุกตาราง
7. **Master Data** (super_admin) — CRUD สาขา (รวมใส่วันปิดร้าน), ตำแหน่ง + SLA, Sourcing Channel, การผูก Recruiter, เพิ่ม requisition (ร้านเปิด/Project/เพิ่มอัตรา), แก้วันที่แจ้งสรรหา, เปลี่ยน TA เจ้าของ
8. **กำหนดสิทธิ์** (super_admin) — จัดการผู้ใช้และ role

## 12. ลำดับการสร้าง (เฟส)

1. **Foundation:** โปรเจกต์, Auth + allowlist, repo layer สำหรับ Sheets, สคริปต์ setup-sheet, domain logic + unit tests, หน้า Tracking (อ่านอย่างเดียว)
2. **Offer flow:** pop-up Offer, Turndown, กติกาย้อนหลัง, version check, StatusLog
3. **Approval flow:** ขอ Cancel/Hold + อัปโหลดรูป, หน้าอนุมัติ, Hold/Resume
4. **Processor:** Import Initial/Resign/Transfer/Requisition/NewEmployee, ร้านปิด, การจับคู่ Hired, ReviewQueue, ปิดงวด + archive, Vercel Cron
5. **Dashboard + Reports + Export**
6. **Master Data + กำหนดสิทธิ์**, ทดสอบกับข้อมูลจริง และ deploy production

จบแต่ละเฟส: deploy preview ให้ผู้ใช้ทดสอบ พร้อมสรุปสิ่งที่ต้องลองกด

## 13. ต้องยืนยันกับพี่/จู ก่อนใช้งานจริง

1. SLA ของ TAT (ตั้งไว้ 30 วันทุกตำแหน่ง) ตัวเลขจริงคือเท่าไร และแยกตามตำแหน่งไหม
2. การโอนย้ายออก ทำให้เกิด vacancy ที่สาขาต้นทางด้วยใช่ไหม
3. รหัสสาขา/ตำแหน่งที่ HR ใช้ในไฟล์ลาออก/โอนย้าย/พนักงานใหม่ ใช้รหัสเดียวกันกับที่จะใส่ในแท็บ `Branches`/`Positions` หรือเปล่า (ถ้าไม่ตรง การจับคู่จะพลาด)
4. ไฟล์ตัวอย่างจาก HR (ลาออก/โอนย้าย/พนักงานใหม่) เพื่อเช็กว่าต้องทำชั้นแปลงคอลัมน์หรือไม่
5. **การตั้งค่าบัญชี (ต้องมีก่อน deploy เฟส 1):** บริษัทใช้ Google Workspace หรือเปล่า, ใครสร้าง Google Cloud project + service account + OAuth ได้, จะใช้ Vercel team ไหน (แนะนำ Pro)
   ระหว่างนี้ builder เขียนโค้ดและทดสอบด้วย Sheet ทดสอบ + บัญชีส่วนตัวไปก่อนได้
6. รายชื่อตำแหน่งที่เปิดอยู่จริงวันนี้ สำหรับใช้กับ `Import_Initial` ตอนเปิดใช้งาน

## 14. สิ่งที่ปล่อยให้ builder ตัดสินใจ

- โครงโฟลเดอร์, การตั้งชื่อ, รายละเอียด component
- กลไก cache ที่ใช้จริง (`unstable_cache` / `use cache` / in-memory) ตราบใดที่ได้พฤติกรรมตามข้อ 9
- การป้องกันการเข้าถึงรูปใน Blob
- ไลบรารี chart และ export
- จะเพิ่ม distributed lock (เช่น Upstash) หรือไม่ ถ้า version check ยังไม่พอ
