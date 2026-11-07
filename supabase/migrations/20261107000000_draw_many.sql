-- สุ่มหลายคนพร้อมกันในครั้งเดียว (ไม่เกินจำนวนที่รอบยังขาด)
--
-- ผู้โชคดีที่สุ่มพร้อมกันจะมี drawn_at เท่ากันทุกคน (now() คือเวลาเริ่ม transaction)
-- จอแสดงผลใช้ค่านี้รวมเป็นชุดเดียวแล้วเปิดชื่อพร้อมกัน ดู web/src/display/reveal.ts

create function public.draw_many(p_count integer) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_event public.events;
  v_round public.rounds;
  v_missing integer;
  v_pool integer;
  v_winners jsonb;
begin
  perform private.require_admin();
  v_event := private.lock_active_event();

  v_round := private.current_round(v_event.id);
  if v_round.id is null then raise exception 'ยังไม่ได้เริ่มรอบ กรุณาเริ่มรอบก่อน'; end if;

  v_missing := v_round.target - private.round_filled(v_round.id);
  if v_missing <= 0 then raise exception 'รอบนี้ได้ผู้โชคดีครบแล้ว กรุณาเริ่มรอบใหม่'; end if;
  if p_count is null or p_count < 1 then raise exception 'จำนวนที่จะสุ่มต้องอย่างน้อย 1 คน'; end if;
  if p_count > v_missing then
    raise exception 'รอบนี้ยังขาดอีก % คน สุ่มเกินจำนวนที่ต้องการไม่ได้', v_missing;
  end if;

  v_pool := private.eligible_count(v_event.id);
  if v_pool = 0 then raise exception 'ไม่มีผู้มีสิทธิ์เหลือให้สุ่มแล้ว'; end if;
  if v_pool < p_count then
    raise exception 'ผู้มีสิทธิ์เหลือ % คน น้อยกว่าจำนวนที่จะสุ่ม (% คน)', v_pool, p_count;
  end if;

  -- เรียงด้วย gen_random_uuid() (ใช้ pg_strong_random) แทน random() เพื่อให้ทำนายผลไม่ได้
  with picked as (
    select r.id
    from public.registrations r
    where r.event_id = v_event.id
      and not r.disqualified
      and not exists (select 1 from public.winners w where w.registration_id = r.id)
    order by gen_random_uuid()
    limit p_count
  ),
  inserted as (
    insert into public.winners (round_id, registration_id)
    select v_round.id, picked.id from picked
    returning id, registration_id
  )
  select jsonb_agg(jsonb_build_object(
    'id', i.id,
    'member_id', re.member_id,
    'full_name', re.full_name,
    'unit', u.name
  ))
  into v_winners
  from inserted i
  join public.registrations re on re.id = i.registration_id
  join public.units u on u.id = re.unit_id;

  return jsonb_build_object(
    'winners', v_winners,
    'round', private.round_json(v_round),
    'eligible_count', private.eligible_count(v_event.id)
  );
end;
$$;

-- draw_next() เดิมกลายเป็นการสุ่ม 1 คน รูปร่างผลลัพธ์เหมือนเดิม
create or replace function public.draw_next() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_result jsonb := public.draw_many(1);
begin
  return jsonb_build_object(
    'winner', v_result -> 'winners' -> 0,
    'round', v_result -> 'round',
    'eligible_count', v_result -> 'eligible_count'
  );
end;
$$;

revoke execute on function public.draw_many(integer) from public, anon, authenticated;
grant execute on function public.draw_many(integer) to authenticated;
