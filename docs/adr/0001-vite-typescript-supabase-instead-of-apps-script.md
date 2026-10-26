# ย้ายจาก Apps Script + Google Sheets ไปเป็น Vite + TypeScript (ไม่ใช้ framework) + Supabase

ระบบเดิมใช้ GAS web app อ่าน/เขียน Google Sheets ใช้ LockService กันการกดพร้อมกัน และให้จอแสดงผลดึงข้อมูลทุก 1.5 วินาที ต้องพึ่ง cache หลายชั้นเพื่อไม่ให้ Sheet ถูกอ่านถี่เกินไป เราย้ายไปเป็นหน้าเว็บ static (Vite multi-page: ลงทะเบียน / แอดมิน / จอแสดงผล) โฮสต์บน Cloudflare Pages แล้วใช้ Supabase (Postgres + Auth + Realtime) แทน ได้ transaction และ unique constraint จริง ได้การอัปเดตจอแบบสด และให้แอดมินล็อกอินผ่าน Supabase Auth แทน key + PIN ที่เขียนค่าไว้ในโค้ด ไม่ใช้ framework เพราะมีแค่ 3 หน้าและ state ไม่ซับซ้อน

## Consequences

- anon key ของ Supabase อยู่ในหน้าเว็บที่ใครก็เปิดได้ ความปลอดภัยทั้งหมดจึงอยู่ที่ RLS และ Postgres functions ฝั่ง client ห้ามเชื่อถือ
- แพ็กเกจฟรีของ Supabase พักโปรเจกต์เมื่อไม่มีการใช้งานราว 7 วัน ต้องปลุกโปรเจกต์ก่อนวันงานทุกครั้ง
- โค้ด GAS เดิมไม่ได้อยู่ใน repo (มี AdminKey/PIN เขียนไว้ในโค้ด) ข้อมูลใน Sheet เดิมไม่ได้นำเข้า
