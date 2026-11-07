-- สุ่มหลายคนพร้อมกัน
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

delete from public.events;

insert into auth.users (id, email) values ('11111111-1111-4111-8111-111111111111', 'admin@test.local');
insert into public.admins (user_id) values ('11111111-1111-4111-8111-111111111111');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

set local role authenticated;
select lives_ok($$ select public.create_event('งาน A') $$, 'แอดมินสร้างงานได้');
reset role;

insert into public.registrations (id, event_id, member_id, full_name, unit_id)
select ('00000000-0000-4000-8000-0000000000' || lpad(g::text, 2, '0'))::uuid,
       (select id from public.events where is_active),
       '2000' || g, 'สมาชิก ' || g, 1
from generate_series(1, 10) g;

-- anon สุ่มไม่ได้
set local role anon;
select throws_ok($$ select public.draw_many(1) $$, '42501', null, 'anon เรียก draw_many ไม่ได้');
reset role;

set local role authenticated;
select throws_like($$ select public.draw_many(2) $$, '%ยังไม่ได้เริ่มรอบ%', 'สุ่มไม่ได้ถ้ายังไม่เริ่มรอบ');
select lives_ok($$ select public.disqualify('00000000-0000-4000-8000-000000000010') $$, 'ตัดสิทธิ์ 1 คน');
select lives_ok($$ select public.start_round('ทอง', 5) $$, 'เริ่มรอบ 5 คน');

select throws_like($$ select public.draw_many(0) $$, '%อย่างน้อย 1 คน%', 'จำนวนที่จะสุ่มต้องอย่างน้อย 1');
select throws_like($$ select public.draw_many(null) $$, '%อย่างน้อย 1 คน%', 'จำนวนที่จะสุ่มว่างไม่ได้');
select throws_like($$ select public.draw_many(6) $$, '%ยังขาดอีก 5 คน%', 'สุ่มเกินจำนวนที่ยังขาดไม่ได้');

-- ===== สุ่มพร้อมกัน 3 คน =====
reset role;
create temp table r1 as select null::jsonb as res;
grant all on r1 to authenticated;
set local role authenticated;
update r1 set res = public.draw_many(3);

select is(jsonb_array_length((select res -> 'winners' from r1)), 3, 'ได้ผู้โชคดี 3 คนในครั้งเดียว');
select is(((select res -> 'round' from r1) ->> 'filled')::int, 3, 'รอบนับผู้โชคดีครบ 3');
select is(((select res from r1) ->> 'eligible_count')::int, 6, 'ผู้มีสิทธิ์เหลือ 6 คน');
select is((select count(distinct registration_id)::int from public.winners), 3, 'ผู้โชคดีไม่ซ้ำกัน');
select is((select count(distinct drawn_at)::int from public.winners), 1, 'คนที่สุ่มพร้อมกันมีเวลาที่ถูกสุ่มเดียวกัน');
select ok(
  (select bool_and(w ? 'member_id' and w ? 'full_name' and w ? 'unit' and w ? 'id')
   from jsonb_array_elements((select res -> 'winners' from r1)) w),
  'ผลลัพธ์มีข้อมูลผู้โชคดีครบ');
select is(
  (select count(*)::int from public.winners where registration_id = '00000000-0000-4000-8000-000000000010'),
  0, 'คนที่ถูกตัดสิทธิ์ไม่ถูกสุ่ม');

select throws_like($$ select public.draw_many(3) $$, '%ยังขาดอีก 2 คน%', 'ครั้งต่อไปสุ่มได้ไม่เกินที่ยังขาด');

-- ===== สละสิทธิ์แล้วสุ่มคนแทนพร้อมกัน =====
select lives_ok($$ select public.forfeit_winner((select id from public.winners limit 1)) $$, 'สละสิทธิ์ 1 คน');
select lives_ok($$ select public.draw_many(3) $$, 'สุ่มที่เหลือทั้งหมด (2 + คนแทน 1)');
select is((public.get_admin_state() -> 'current_round' ->> 'filled')::int, 5, 'รอบครบ 5 คน');
select throws_like($$ select public.draw_many(1) $$, '%ครบแล้ว%', 'รอบครบแล้วสุ่มต่อไม่ได้');

-- ===== ผู้มีสิทธิ์ไม่พอ =====
select lives_ok($$ select public.requalify('00000000-0000-4000-8000-000000000010') $$, 'คืนสิทธิ์');
select lives_ok($$ select public.start_round('เงิน', 3) $$, 'เริ่มรอบใหม่ 3 คน');
select lives_ok(
  $$ select public.update_round((select id from public.rounds where seq = 2), 'เงิน', 10) $$,
  'เพิ่มจำนวนที่ต้องการเกินผู้มีสิทธิ์');
select throws_like($$ select public.draw_many(5) $$, '%ผู้มีสิทธิ์เหลือ 4 คน%', 'สุ่มเกินผู้มีสิทธิ์ที่เหลือไม่ได้');
select lives_ok($$ select public.draw_many(4) $$, 'สุ่มผู้มีสิทธิ์ที่เหลือทั้งหมดได้');
select throws_like($$ select public.draw_many(1) $$, '%ไม่มีผู้มีสิทธิ์เหลือ%', 'ไม่มีผู้มีสิทธิ์แล้วสุ่มไม่ได้');

-- ===== draw_next ยังคืนรูปร่างเดิม =====
select lives_ok(
  $$ select public.update_round((select id from public.rounds where seq = 2), 'เงิน', 4) $$,
  'ลดจำนวนที่ต้องการให้เท่ากับที่ได้');
select lives_ok($$ select public.create_event('งาน B') $$, 'เริ่มงานใหม่');
reset role;
insert into public.registrations (event_id, member_id, full_name, unit_id)
values ((select id from public.events where is_active), '30001', 'สมาชิก B1', 1);
set local role authenticated;
select lives_ok($$ select public.start_round('ทอง', 1) $$, 'เริ่มรอบในงานใหม่');
select is(public.draw_next() -> 'winner' ->> 'member_id', '30001', 'draw_next คืน winner แบบเดิม');

reset role;
select * from finish();
rollback;
