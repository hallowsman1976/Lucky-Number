# ระบบจับรางวัลผู้โชคดี สหกรณ์ออมทรัพย์สาธารณสุขมุกดาหาร

สมาชิกสแกน QR เพื่อลงทะเบียน แล้วแอดมินสุ่มผู้โชคดีทีละคน ขึ้นจอหน้าเวทีแบบสด

- คำศัพท์ของระบบ: [CONTEXT.md](CONTEXT.md)
- เหตุผลของการตัดสินใจหลัก: [docs/adr/](docs/adr/)

## โครงสร้าง

| โฟลเดอร์ | คืออะไร |
|---|---|
| `web/` | หน้าเว็บ Vite + TypeScript (ไม่ใช้ framework): `/` ลงทะเบียน, `/admin.html` แอดมิน, `/display.html` จอแสดงผล |
| `supabase/migrations/` | ตาราง, RLS และ Postgres functions ทั้งหมด (การสุ่มอยู่ที่นี่) |
| `supabase/tests/database/` | เทสต์ pgTAP ของ functions และสิทธิ์การเข้าถึง |
| `supabase/seed.sql` | ข้อมูลทดสอบสำหรับ local เท่านั้น (มีบัญชีแอดมินทดสอบ) |

ระบบเดิม (Google Apps Script) ไม่ได้อยู่ใน repo นี้

## พัฒนาบนเครื่อง

ต้องมี Node 22+ และ Docker Desktop

```bash
npm install
```

```bash
npm install --prefix web
```

```bash
npm run db:start
```

Supabase local ใช้พอร์ต 553xx (API `http://127.0.0.1:55321`, Studio `http://127.0.0.1:55323`) เพื่อไม่ชนกับโปรเจกต์อื่นที่ใช้ 543xx

คัดลอก `web/.env.example` เป็น `web/.env.local` แล้วใส่ `ANON_KEY` จาก `npx supabase status`

```bash
npm run dev --prefix web
```

ล็อกอินหน้าแอดมินด้วยบัญชีทดสอบที่เขียนไว้ใน `supabase/seed.sql`

### เทสต์

```bash
npm run db:test
```

```bash
npm test --prefix web
```

```bash
npm run build --prefix web
```

แก้ schema: สร้างไฟล์ใหม่ใน `supabase/migrations/` (อย่าแก้ไฟล์ที่ push ขึ้น production แล้ว) จากนั้น `npm run db:reset` เพื่อรันใหม่ทั้งหมดพร้อม seed

## ติดตั้งใช้งานจริง

### 1. Supabase

1. สร้างโปรเจกต์ใหม่ที่ region **Southeast Asia (Singapore)**
2. เชื่อมโปรเจกต์แล้ว push migration (ห้ามรัน `seed.sql` บน production)
   ```bash
   npx supabase link --project-ref <project-ref>
   ```
   ```bash
   npm run db:push
   ```
3. **Authentication → Sign In / Providers**: ปิด "Allow new users to sign up" แต่ต้องเปิด Email provider ไว้
4. สร้างบัญชีแอดมินทีละคน: **Authentication → Users → Add user** (ติ๊ก Auto Confirm) แล้วรันใน SQL Editor:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'อีเมลแอดมิน';
   ```
5. **Authentication → URL Configuration**: ตั้ง Site URL เป็นโดเมนเว็บจริง
6. (ถ้า build บนเครื่อง) ใส่ URL และ publishable key ของโปรเจกต์ใน `web/.env.production.local` ซึ่ง `npm run build` จะใช้แทน `.env.local` ส่วน `npm run dev` ยังต่อ Supabase local เหมือนเดิม

### 2. Cloudflare Pages

- Root directory: `web`
- Build command: `npm run build`
- Build output directory: `dist`
- Environment variables: `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY` (publishable/anon key จาก **Project Settings → API**) ซึ่งเปิดเผยได้ เพราะความปลอดภัยอยู่ที่ RLS

### 3. ก่อนวันงานทุกครั้ง

- [ ] **ปลุกโปรเจกต์ Supabase** แพ็กเกจฟรีจะพักโปรเจกต์ถ้าไม่มีการใช้งานราว 7 วัน ให้เข้า dashboard กด Restore ล่วงหน้าอย่างน้อย 1 วัน
- [ ] ล็อกอินหน้าแอดมิน กด "เริ่มงานใหม่" แล้วตั้งชื่องาน
- [ ] เปิด `/display.html` บนเครื่องที่ต่อโปรเจกเตอร์ แล้วลองสแกน QR ด้วยมือถือ
- [ ] หลังจบงาน ดาวน์โหลด CSV รายชื่อผู้โชคดีเก็บไว้

## วันงาน

1. จอแสดงผลอยู่ในโหมดลงทะเบียน (QR) และเปิดรับลงทะเบียน
2. พอถึงเวลาสุ่ม กด "ปิดรับลงทะเบียน" แล้วกด "โหมดวงล้อ"
3. เริ่มรอบ (1 รอบ = รางวัล 1 ชนิด) แล้วกด "สุ่มผู้โชคดีคนถัดไป" ทีละคน จอจะหมุนแล้วเปิดชื่อเอง
4. ถ้าผู้โชคดีไม่มาขึ้นรับ กด "สละสิทธิ์" แล้วสุ่มคนแทน (ยกเลิกการสละสิทธิ์ได้จนกว่าจะสุ่มคนแทน)
5. ต้องได้ผู้โชคดีครบรอบก่อนจึงจะเริ่มรอบใหม่ได้ ถ้าตั้งจำนวนผิด ให้แก้ในช่อง "บันทึกการแก้ไข"
