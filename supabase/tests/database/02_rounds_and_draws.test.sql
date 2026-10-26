-- รอบ, การสุ่ม, สละสิทธิ์, ตัดสิทธิ์, เริ่มงานใหม่
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- แยกจากข้อมูล seed (ทั้งหมด rollback ตอนจบ)
delete from public.events;

insert into auth.users (id, email) values ('11111111-1111-4111-8111-111111111111', 'admin@test.local');
insert into public.admins (user_id) values ('11111111-1111-4111-8111-111111111111');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

set local role authenticated;
select lives_ok($$ select public.create_event('งาน A') $$, 'แอดมินสร้างงานได้');
reset role;

insert into public.registrations (id, event_id, member_id, full_name, unit_id)
select ('00000000-0000-4000-8000-00000000000' || g)::uuid,
       (select id from public.events where is_active),
       '1000' || g, 'สมาชิก ' || g, 1
from generate_series(1, 5) g;

set local role authenticated;

-- ===== เริ่มรอบ =====
select throws_like($$ select public.draw_next() $$, '%ยังไม่ได้เริ่มรอบ%', 'สุ่มไม่ได้ถ้ายังไม่เริ่มรอบ');
select throws_like($$ select public.start_round('ทอง', 10) $$, '%ผู้มีสิทธิ์เหลือ 5 คน%', 'จำนวนที่ต้องการต้องไม่เกินกลุ่มผู้มีสิทธิ์');
select throws_like($$ select public.start_round('ทอง', 0) $$, '%1-1000%', 'จำนวนที่ต้องการต้องอยู่ในช่วง');
select lives_ok($$ select public.disqualify('00000000-0000-4000-8000-000000000005') $$, 'ตัดสิทธิ์ได้ก่อนถูกสุ่ม');
select throws_like($$ select public.start_round('ทอง', 5) $$, '%ผู้มีสิทธิ์เหลือ 4 คน%', 'คนที่ถูกตัดสิทธิ์ไม่นับเป็นผู้มีสิทธิ์');
select lives_ok($$ select public.start_round('ทอง', 3) $$, 'เริ่มรอบได้');
select throws_like($$ select public.start_round('เงิน', 1) $$, '%ยังได้ผู้โชคดีไม่ครบ%', 'เริ่มรอบใหม่ไม่ได้ถ้ารอบปัจจุบันยังไม่ครบ');

-- ===== สุ่ม =====
select lives_ok($$ select public.draw_next() $$, 'สุ่มคนที่ 1');
select lives_ok($$ select public.draw_next() $$, 'สุ่มคนที่ 2');
select lives_ok($$ select public.draw_next() $$, 'สุ่มคนที่ 3');
select is((select count(distinct registration_id)::int from public.winners), 3, 'ผู้โชคดีไม่ซ้ำกัน');
select is(
  (select count(*)::int from public.winners where registration_id = '00000000-0000-4000-8000-000000000005'),
  0, 'คนที่ถูกตัดสิทธิ์ไม่ถูกสุ่ม');
select throws_like($$ select public.draw_next() $$, '%ครบแล้ว%', 'สุ่มเกินจำนวนที่ต้องการไม่ได้');
select throws_like(
  $$ select public.disqualify((select registration_id from public.winners limit 1)) $$,
  '%ตัดสิทธิ์ไม่ได้%', 'ตัดสิทธิ์คนที่ถูกสุ่มได้แล้วไม่ได้');

-- ===== สละสิทธิ์ =====
reset role;
create temp table w1 as select id, registration_id from public.winners order by id limit 1;
grant select on w1 to authenticated;
set local role authenticated;

select throws_like($$ select public.undo_forfeit((select id from w1)) $$, '%ไม่ได้สละสิทธิ์%', 'ยกเลิกการสละสิทธิ์ของคนที่ไม่ได้สละสิทธิ์ไม่ได้');
select lives_ok($$ select public.forfeit_winner((select id from w1)) $$, 'สละสิทธิ์ได้');
select throws_like($$ select public.forfeit_winner((select id from w1)) $$, '%สละสิทธิ์ไปแล้ว%', 'สละสิทธิ์ซ้ำไม่ได้');
select is((public.get_admin_state() -> 'current_round' ->> 'filled')::int, 2, 'สละสิทธิ์แล้วรอบไม่ครบ');
select lives_ok($$ select public.undo_forfeit((select id from w1)) $$, 'ยกเลิกการสละสิทธิ์ได้ก่อนสุ่มคนแทน');
select is((public.get_admin_state() -> 'current_round' ->> 'filled')::int, 3, 'ยกเลิกแล้วรอบกลับมาครบ');
select lives_ok($$ select public.forfeit_winner((select id from w1)) $$, 'สละสิทธิ์อีกครั้ง');
select lives_ok($$ select public.draw_next() $$, 'สุ่มคนแทนได้');
select is((public.get_admin_state() -> 'current_round' ->> 'filled')::int, 3, 'รอบกลับมาครบหลังสุ่มคนแทน');
select is((public.get_display_state() ->> 'eligible_count')::int, 0, 'คนที่สละสิทธิ์ไม่กลับเข้ากลุ่มผู้มีสิทธิ์');
select throws_like($$ select public.undo_forfeit((select id from w1)) $$, '%สุ่มคนแทนไปแล้ว%', 'ยกเลิกการสละสิทธิ์ไม่ได้หลังสุ่มคนแทน');

-- ===== แก้รอบ =====
select throws_like(
  $$ select public.update_round((select id from public.rounds where seq = 1), 'ทอง', 2) $$,
  '%ไม่น้อยกว่า%', 'ลดจำนวนที่ต้องการต่ำกว่าผู้โชคดีที่ได้ไม่ได้');
select lives_ok(
  $$ select public.update_round((select id from public.rounds where seq = 1), 'ทองคำ', 4) $$,
  'เพิ่มจำนวนที่ต้องการได้');
select is((select name from public.rounds where seq = 1), 'ทองคำ', 'แก้ชื่อรอบได้');
select throws_like($$ select public.draw_next() $$, '%ไม่มีผู้มีสิทธิ์เหลือ%', 'สุ่มไม่ได้เมื่อไม่มีผู้มีสิทธิ์');
select lives_ok(
  $$ select public.update_round((select id from public.rounds where seq = 1), 'ทองคำ', 3) $$,
  'ลดจำนวนที่ต้องการกลับได้');

-- ===== รอบถัดไป =====
select lives_ok($$ select public.requalify('00000000-0000-4000-8000-000000000005') $$, 'คืนสิทธิ์ได้');
select lives_ok($$ select public.start_round('เงิน', 1) $$, 'เริ่มรอบใหม่ได้เมื่อรอบเดิมครบ');
select throws_like(
  $$ select public.forfeit_winner((select w.id from public.winners w join public.rounds r on r.id = w.round_id
                                   where r.seq = 1 and w.forfeited_at is null limit 1)) $$,
  '%รอบปัจจุบัน%', 'สละสิทธิ์ย้อนหลังในรอบที่ผ่านไปแล้วไม่ได้');
select throws_like(
  $$ select public.update_round((select id from public.rounds where seq = 1), 'ทองคำ', 5) $$,
  '%รอบปัจจุบัน%', 'แก้รอบที่ผ่านไปแล้วไม่ได้');
select is(
  public.draw_next() -> 'winner' ->> 'member_id', '10005',
  'คนที่ได้คืนสิทธิ์ถูกสุ่มได้');
select ok(
  (public.get_display_state() -> 'winners' -> 0 ->> 'member_id_masked') = '10***',
  'จอแสดงผลได้เลขสมาชิกแบบปิดบัง');
select is(
  (select count(*)::int from jsonb_array_elements(public.get_display_state() -> 'winners') w where (w ->> 'forfeited')::boolean),
  1, 'จอแสดงผลรู้ว่าใครสละสิทธิ์');

-- ===== เริ่มงานใหม่ =====
select lives_ok($$ select public.create_event('งาน B') $$, 'เริ่มงานใหม่ได้');
select is((select count(*)::int from public.events where is_active), 1, 'มีงาน active ได้ทีละงาน');
select is((select title from public.events where is_active), 'งาน B', 'งานใหม่เป็นงานที่ active');
select is((select count(*)::int from public.winners), 5, 'ข้อมูลงานเดิมยังอยู่');

reset role;
set local role anon;
select lives_ok($$ select public.register('10001', 'สมาชิก 1', 1) $$, 'สมาชิกเดิมลงทะเบียนงานใหม่ได้');
select is((public.get_display_state() ->> 'total_registrations')::int, 1, 'จำนวนลงทะเบียนนับเฉพาะงานใหม่');
select is(public.get_display_state() -> 'current_round', 'null'::jsonb, 'งานใหม่ยังไม่มีรอบ');
reset role;

select * from finish();
rollback;
