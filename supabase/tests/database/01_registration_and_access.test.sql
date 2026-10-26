-- การลงทะเบียน + สิทธิ์การเข้าถึง (anon / ผู้ใช้ทั่วไป / แอดมิน)
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- แยกจากข้อมูล seed (ทั้งหมด rollback ตอนจบ)
delete from public.events;

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'admin@test.local'),
  ('22222222-2222-4222-8222-222222222222', 'someone@test.local');
insert into public.admins (user_id) values ('11111111-1111-4111-8111-111111111111');
insert into public.events (title) values ('งานทดสอบ');

-- ===== anon =====
set local role anon;

select lives_ok($$ select public.register('123', '  สมชาย   ใจดี ', 1) $$, 'anon ลงทะเบียนได้');
select throws_like($$ select public.register('123', 'คนอื่น', 2) $$, '%ลงทะเบียนไปแล้ว%', 'เลขสมาชิกซ้ำในงานเดียวกันถูกปฏิเสธ');
select throws_like($$ select public.register(' 1 2 3 ', 'คนอื่น', 2) $$, '%ลงทะเบียนไปแล้ว%', 'ช่องว่างในเลขสมาชิกถูกตัดก่อนตรวจซ้ำ');
select lives_ok($$ select public.register('00123', 'สมหญิง รักดี', 2) $$, '00123 กับ 123 เป็นคนละเลขสมาชิก');
select throws_like($$ select public.register('12a', 'ใครสักคน', 1) $$, '%ตัวเลขเท่านั้น%', 'เลขสมาชิกที่มีตัวอักษรถูกปฏิเสธ');
select throws_like($$ select public.register('', 'ใครสักคน', 1) $$, '%กรุณากรอกเลขสมาชิก%', 'ต้องกรอกเลขสมาชิก');
select throws_like($$ select public.register('999', '   ', 1) $$, '%ชื่อ-นามสกุล%', 'ต้องกรอกชื่อ-นามสกุล');
select throws_like($$ select public.register('999', 'ใครสักคน', 999) $$, '%หน่วยงาน%', 'หน่วยงานต้องมีอยู่จริง');

select throws_ok($$ select * from public.registrations $$, '42501', null, 'anon อ่านตาราง registrations ไม่ได้');
select throws_ok($$ insert into public.events (title) values ('แอบสร้าง') $$, '42501', null, 'anon เขียนตารางตรง ๆ ไม่ได้');
select throws_ok($$ update public.registrations set disqualified = true $$, '42501', null, 'anon แก้การลงทะเบียนตรง ๆ ไม่ได้');
select throws_ok($$ select public.draw_next() $$, '42501', null, 'anon เรียก function ของแอดมินไม่ได้');
select throws_ok($$ select public.get_admin_state() $$, '42501', null, 'anon อ่าน state ของแอดมินไม่ได้');

select is((public.get_display_state() ->> 'total_registrations')::int, 2, 'จอแสดงผลเห็นจำนวนผู้ลงทะเบียน');
select is((public.get_display_state() ->> 'eligible_count')::int, 2, 'จอแสดงผลเห็นจำนวนผู้มีสิทธิ์');
select is(jsonb_array_length(public.get_registration_form() -> 'units'), 9, 'ฟอร์มลงทะเบียนได้รายชื่อหน่วยงานครบ');
select is(jsonb_array_length(public.get_effect_names()), 2, 'รายชื่อสำหรับ effect มีเฉพาะผู้มีสิทธิ์');

reset role;

select is((select full_name from public.registrations where member_id = '123'), 'สมชาย ใจดี', 'ช่องว่างในชื่อถูกจัดให้เรียบร้อย');
select is(private.mask_member_id('123456'), '12****', 'ปิดบังเลขสมาชิก เหลือ 2 หลักแรก');
select is(private.mask_member_id('12'), '**', 'เลขสมาชิกสั้นถูกปิดบังทั้งหมด');

-- ===== ผู้ใช้ที่ล็อกอินแต่ไม่ใช่แอดมิน =====
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.registrations), 0, 'ผู้ใช้ที่ไม่ใช่แอดมินอ่าน registrations ไม่เห็นข้อมูล');
select throws_like($$ select public.draw_next() $$, '%ไม่มีสิทธิ์%', 'ผู้ใช้ที่ไม่ใช่แอดมินสุ่มไม่ได้');
select throws_like($$ select public.create_event('งานปลอม') $$, '%ไม่มีสิทธิ์%', 'ผู้ใช้ที่ไม่ใช่แอดมินสร้างงานไม่ได้');

reset role;

-- ===== แอดมิน =====
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.registrations), 2, 'แอดมินอ่าน registrations ได้');
select is(jsonb_array_length(public.get_admin_state() -> 'registrations'), 2, 'state ของแอดมินมีรายชื่อครบ');
select is(public.get_admin_state() -> 'registrations' -> 0 ->> 'member_id', '123', 'แอดมินเห็นเลขสมาชิกเต็ม');
select lives_ok($$ select public.set_registration_open(false) $$, 'แอดมินปิดรับลงทะเบียนได้');
select throws_like($$ select public.set_display_mode('slideshow') $$, '%โหมด%', 'โหมดจอแสดงผลต้องถูกต้อง');
select lives_ok($$ select public.set_display_mode('wheel') $$, 'แอดมินเปลี่ยนโหมดจอแสดงผลได้');

reset role;
set local role anon;

select throws_like($$ select public.register('555', 'มาสาย', 1) $$, '%ปิดรับลงทะเบียน%', 'ลงทะเบียนไม่ได้เมื่อปิดรับลงทะเบียน');
select is(public.get_display_state() -> 'event' ->> 'display_mode', 'wheel', 'จอแสดงผลเห็นโหมดใหม่');

reset role;

-- ===== ไม่มีงานที่ active =====
update public.events set is_active = false;
set local role anon;

select throws_like($$ select public.register('556', 'ใครสักคน', 1) $$, '%ยังไม่เปิดงาน%', 'ลงทะเบียนไม่ได้เมื่อไม่มีงาน');
select is(public.get_display_state() -> 'event', 'null'::jsonb, 'จอแสดงผลรู้ว่าไม่มีงาน');

reset role;

select * from finish();
rollback;
