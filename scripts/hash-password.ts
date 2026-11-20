/**
 * สร้างค่า hash ของรหัสผ่าน เผื่อต้องกรอกลงแท็บ Logins ใน Sheet เอง
 *
 *   pnpm password:hash "รหัสผ่านที่ต้องการ"
 *
 * ปกติไม่ต้องใช้: ผู้ดูแลระบบตั้งชื่อผู้ใช้/รหัสผ่านได้ที่หน้า "กำหนดสิทธิ์ผู้ใช้" โดยตรง
 * วางค่าที่ได้ในคอลัมน์ password_hash ของแท็บ Logins (คอลัมน์อื่น: username, email ของผู้ใช้ในแท็บ Users)
 */
import { hashPassword, MIN_PASSWORD } from "../src/lib/auth/password";

const password = process.argv[2];
if (!password || password.length < MIN_PASSWORD) {
  console.error(`ใช้: pnpm password:hash "รหัสผ่าน (อย่างน้อย ${MIN_PASSWORD} ตัวอักษร)"`);
  process.exit(1);
}
console.log(hashPassword(password));
