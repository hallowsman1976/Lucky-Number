-- ระบบจับรางวัลผู้โชคดี — schema แรก
-- คำศัพท์ทั้งหมดตาม CONTEXT.md, เหตุผลเรื่องการสุ่มใน DB ดู docs/adr/0002
--
-- หลักความปลอดภัย: anon key อยู่ในหน้าเว็บที่ใครก็เปิดได้
--   - anon/authenticated ไม่มีสิทธิ์เขียนตารางตรง ๆ ทุกการเขียนผ่าน function ด้านล่าง
--   - ตาราง registrations (มีเลขสมาชิก) อ่านได้เฉพาะแอดมิน
--   - function ของแอดมินตรวจ private.require_admin() ทุกตัว
--
-- หลักการกันกดพร้อมกัน: ทุก mutation ของแอดมินล็อกแถวงานที่ active ด้วย FOR UPDATE
-- ส่วนการลงทะเบียนล็อกแบบ FOR SHARE (ลงทะเบียนพร้อมกันได้ แต่ไม่ชนกับการสุ่ม/ปิดรับลงทะเบียน)

create schema if not exists private;
revoke all on schema private from public;

-- ===== Tables =====

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  is_active boolean not null default true,
  registration_open boolean not null default true,
  display_mode text not null default 'register' check (display_mode in ('register', 'wheel')),
  created_at timestamptz not null default now()
);
-- มีงานที่ active ได้ทีละงาน
create unique index events_single_active on public.events ((true)) where is_active;

create table public.units (
  id smallint generated always as identity primary key,
  name text not null unique,
  sort_order smallint not null default 0,
  is_active boolean not null default true
);

insert into public.units (name, sort_order) values
  ('สสจ.มุกดาหาร', 1),
  ('อ.เมืองมุกดาหาร', 2),
  ('อ.นิคมคำสร้อย', 3),
  ('อ.หนองสูง', 4),
  ('อ.คำชะอี', 5),
  ('อ.ดงหลวง', 6),
  ('อ.ดอนตาล', 7),
  ('อ.หว้านใหญ่', 8),
  ('บำนาญ', 9);

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  -- เก็บเป็นข้อความตามเลขบนบัตร: '00123' กับ '123' เป็นคนละเลข
  member_id text not null check (member_id ~ '^[0-9]{1,30}$'),
  full_name text not null check (char_length(full_name) between 1 and 100),
  unit_id smallint not null references public.units (id),
  disqualified boolean not null default false,
  created_at timestamptz not null default now(),
  constraint registrations_one_per_event unique (event_id, member_id)
);

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  seq integer not null check (seq >= 1),
  name text not null check (char_length(name) between 1 and 200),
  target integer not null check (target between 1 and 1000),
  created_at timestamptz not null default now(),
  constraint rounds_seq_per_event unique (event_id, seq)
);

create table public.winners (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  -- ถูกสุ่มได้ครั้งเดียวต่อการลงทะเบียน (สละสิทธิ์แล้วก็ไม่กลับเข้ากลุ่มผู้มีสิทธิ์)
  registration_id uuid not null unique references public.registrations (id) on delete cascade,
  drawn_at timestamptz not null default now(),
  forfeited_at timestamptz
);
create index winners_round_id_idx on public.winners (round_id);

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ===== Privileges + RLS =====

revoke all on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

alter table public.events enable row level security;
alter table public.units enable row level security;
alter table public.registrations enable row level security;
alter table public.rounds enable row level security;
alter table public.winners enable row level security;
alter table public.admins enable row level security;

-- events/units/rounds/winners ไม่มีข้อมูลระบุตัวบุคคล เปิดให้อ่านได้ (Realtime ต้องใช้สิทธิ์ select)
grant select on public.events, public.units, public.rounds, public.winners to anon, authenticated;
create policy "public read" on public.events for select to anon, authenticated using (true);
create policy "public read" on public.units for select to anon, authenticated using (true);
create policy "public read" on public.rounds for select to anon, authenticated using (true);
create policy "public read" on public.winners for select to anon, authenticated using (true);


-- ===== Private helpers =====

create function private.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

grant usage on schema private to authenticated;
revoke execute on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

grant select on public.registrations to authenticated;
create policy "admin read" on public.registrations for select to authenticated using ((select private.is_admin()));

create function private.require_admin() returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'ไม่มีสิทธิ์ใช้งานส่วนนี้ กรุณาเข้าสู่ระบบด้วยบัญชีแอดมิน' using errcode = '42501';
  end if;
end;
$$;

-- งานที่ active พร้อมล็อกแถว (ใช้ใน function ที่เขียนข้อมูล)
create function private.lock_active_event() returns public.events
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_event public.events;
begin
  select * into v_event from public.events where is_active for update;
  if not found then
    raise exception 'ยังไม่มีงานที่เปิดใช้อยู่ กรุณาสร้างงานก่อน';
  end if;
  return v_event;
end;
$$;

create function private.current_round(p_event_id uuid) returns public.rounds
language sql stable security definer set search_path = ''
as $$
  select * from public.rounds where event_id = p_event_id order by seq desc limit 1;
$$;

-- จำนวนผู้โชคดีที่ไม่สละสิทธิ์ของรอบ
create function private.round_filled(p_round_id uuid) returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer from public.winners where round_id = p_round_id and forfeited_at is null;
$$;

create function private.eligible_count(p_event_id uuid) returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer
  from public.registrations r
  where r.event_id = p_event_id
    and not r.disqualified
    and not exists (select 1 from public.winners w where w.registration_id = r.id);
$$;

create function private.mask_member_id(p_member_id text) returns text
language sql immutable set search_path = ''
as $$
  select case
    when char_length(p_member_id) <= 2 then repeat('*', char_length(p_member_id))
    else left(p_member_id, 2) || repeat('*', char_length(p_member_id) - 2)
  end;
$$;

create function private.round_json(p_round public.rounds) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when p_round.id is null then null else jsonb_build_object(
    'id', p_round.id,
    'seq', p_round.seq,
    'name', p_round.name,
    'target', p_round.target,
    'filled', private.round_filled(p_round.id)
  ) end;
$$;

create function private.event_json(p_event public.events) returns jsonb
language sql stable set search_path = ''
as $$
  select case when p_event.id is null then null else jsonb_build_object(
    'id', p_event.id,
    'title', p_event.title,
    'registration_open', p_event.registration_open,
    'display_mode', p_event.display_mode
  ) end;
$$;

-- ===== Public (anon) functions =====

create function public.get_registration_form() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'event', (select private.event_json(e) from public.events e where e.is_active),
    'units', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name) order by u.sort_order, u.id)
      from public.units u where u.is_active
    ), '[]'::jsonb)
  );
$$;

create function public.register(p_member_id text, p_full_name text, p_unit_id integer) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_event public.events;
  v_member_id text := regexp_replace(coalesce(p_member_id, ''), '\s', '', 'g');
  v_full_name text := btrim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g'));
begin
  if v_member_id = '' then raise exception 'กรุณากรอกเลขสมาชิก'; end if;
  if v_member_id !~ '^[0-9]+$' then raise exception 'เลขสมาชิกต้องเป็นตัวเลขเท่านั้น'; end if;
  if char_length(v_member_id) > 30 then raise exception 'เลขสมาชิกยาวเกินไป'; end if;
  if v_full_name = '' then raise exception 'กรุณากรอกชื่อ-นามสกุล'; end if;
  if char_length(v_full_name) > 100 then raise exception 'ชื่อ-นามสกุลยาวเกินไป'; end if;
  if not exists (select 1 from public.units where id = p_unit_id and is_active) then
    raise exception 'กรุณาเลือกหน่วยงานให้ถูกต้อง';
  end if;

  select * into v_event from public.events where is_active for share;
  if not found then raise exception 'ยังไม่เปิดงาน กรุณาลองใหม่ภายหลัง'; end if;
  if not v_event.registration_open then raise exception 'ปิดรับลงทะเบียนแล้ว'; end if;

  insert into public.registrations (event_id, member_id, full_name, unit_id)
  values (v_event.id, v_member_id, v_full_name, p_unit_id)
  on conflict on constraint registrations_one_per_event do nothing;

  if not found then
    raise exception 'เลขสมาชิก % ลงทะเบียนไปแล้ว ห้ามลงทะเบียนซ้ำ', v_member_id;
  end if;
end;
$$;

-- state สำหรับจอแสดงผล: เลขสมาชิกถูกปิดบังบางส่วนเสมอ
create function public.get_display_state() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_event public.events;
begin
  select * into v_event from public.events where is_active;
  if not found then
    return jsonb_build_object('event', null);
  end if;

  return jsonb_build_object(
    'event', private.event_json(v_event),
    'total_registrations', (select count(*) from public.registrations where event_id = v_event.id),
    'eligible_count', private.eligible_count(v_event.id),
    'current_round', private.round_json(private.current_round(v_event.id)),
    'winners', coalesce((
      select jsonb_agg(w order by w.drawn_at desc)
      from (
        select
          wi.id,
          wi.round_id,
          ro.name as round_name,
          re.full_name,
          u.name as unit,
          private.mask_member_id(re.member_id) as member_id_masked,
          wi.drawn_at,
          wi.forfeited_at is not null as forfeited
        from public.winners wi
        join public.rounds ro on ro.id = wi.round_id
        join public.registrations re on re.id = wi.registration_id
        join public.units u on u.id = re.unit_id
        where ro.event_id = v_event.id
        order by wi.drawn_at desc
        limit 300
      ) w
    ), '[]'::jsonb)
  );
end;
$$;

-- รายชื่อสำหรับ effect หมุนชื่อบนจอเท่านั้น ผลจริงมาจาก draw_next()
create function public.get_effect_names() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(n.full_name), '[]'::jsonb)
  from (
    select r.full_name
    from public.registrations r
    join public.events e on e.id = r.event_id and e.is_active
    where not r.disqualified
      and not exists (select 1 from public.winners w where w.registration_id = r.id)
    order by random()
    limit 200
  ) n;
$$;

-- ===== Admin functions =====

create function public.get_admin_state() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_event public.events;
begin
  perform private.require_admin();

  select * into v_event from public.events where is_active;
  if not found then
    return jsonb_build_object('event', null);
  end if;

  return jsonb_build_object(
    'event', private.event_json(v_event),
    'current_round', private.round_json(private.current_round(v_event.id)),
    'rounds', coalesce((
      select jsonb_agg(private.round_json(ro) order by ro.seq)
      from public.rounds ro where ro.event_id = v_event.id
    ), '[]'::jsonb),
    'registrations', coalesce((
      select jsonb_agg(x order by x.created_at)
      from (
        select
          re.id,
          re.member_id,
          re.full_name,
          u.name as unit,
          re.disqualified,
          re.created_at,
          case when wi.id is null then null else jsonb_build_object(
            'id', wi.id,
            'round_id', wi.round_id,
            'round_name', ro.name,
            'drawn_at', wi.drawn_at,
            'forfeited_at', wi.forfeited_at
          ) end as winner
        from public.registrations re
        join public.units u on u.id = re.unit_id
        left join public.winners wi on wi.registration_id = re.id
        left join public.rounds ro on ro.id = wi.round_id
        where re.event_id = v_event.id
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

-- เริ่มงานใหม่: งานเดิมเลิก active (ข้อมูลยังอยู่ดูย้อนหลังได้)
create function public.create_event(p_title text) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_id uuid;
begin
  perform private.require_admin();
  if v_title = '' then raise exception 'กรุณาตั้งชื่องาน'; end if;
  if char_length(v_title) > 200 then raise exception 'ชื่องานยาวเกินไป'; end if;

  perform 1 from public.events where is_active for update;
  update public.events set is_active = false where is_active;
  insert into public.events (title) values (v_title) returning id into v_id;
  return v_id;
end;
$$;

create function public.set_registration_open(p_open boolean) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_event public.events;
begin
  perform private.require_admin();
  v_event := private.lock_active_event();
  update public.events set registration_open = coalesce(p_open, false) where id = v_event.id;
end;
$$;

create function public.set_display_mode(p_mode text) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_event public.events;
begin
  perform private.require_admin();
  if p_mode is null or p_mode not in ('register', 'wheel') then
    raise exception 'โหมดจอแสดงผลไม่ถูกต้อง';
  end if;
  v_event := private.lock_active_event();
  update public.events set display_mode = p_mode where id = v_event.id;
end;
$$;

create function public.start_round(p_name text, p_target integer) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_event public.events;
  v_current public.rounds;
  v_name text := btrim(coalesce(p_name, ''));
  v_pool integer;
  v_round public.rounds;
begin
  perform private.require_admin();
  if v_name = '' then raise exception 'กรุณาตั้งชื่อรอบ'; end if;
  if char_length(v_name) > 200 then raise exception 'ชื่อรอบยาวเกินไป'; end if;
  if p_target is null or p_target < 1 or p_target > 1000 then
    raise exception 'จำนวนที่ต้องการต้องเป็นตัวเลข 1-1000';
  end if;

  v_event := private.lock_active_event();

  v_current := private.current_round(v_event.id);
  if v_current.id is not null and private.round_filled(v_current.id) < v_current.target then
    raise exception 'รอบ "%" ยังได้ผู้โชคดีไม่ครบ (%/%) กรุณาสุ่มให้ครบหรือแก้จำนวนที่ต้องการก่อนเริ่มรอบใหม่',
      v_current.name, private.round_filled(v_current.id), v_current.target;
  end if;

  v_pool := private.eligible_count(v_event.id);
  if v_pool < p_target then
    raise exception 'ผู้มีสิทธิ์เหลือ % คน น้อยกว่าจำนวนที่ต้องการ (% คน)', v_pool, p_target;
  end if;

  insert into public.rounds (event_id, seq, name, target)
  values (v_event.id, coalesce(v_current.seq, 0) + 1, v_name, p_target)
  returning * into v_round;

  return private.round_json(v_round);
end;
$$;

-- แก้รอบปัจจุบัน: จำนวนที่ต้องการต้องไม่น้อยกว่าผู้โชคดีที่ได้ไปแล้ว
create function public.update_round(p_round_id uuid, p_name text, p_target integer) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_event public.events;
  v_current public.rounds;
  v_name text := btrim(coalesce(p_name, ''));
  v_filled integer;
begin
  perform private.require_admin();
  if v_name = '' then raise exception 'กรุณาตั้งชื่อรอบ'; end if;
  if char_length(v_name) > 200 then raise exception 'ชื่อรอบยาวเกินไป'; end if;
  if p_target is null or p_target < 1 or p_target > 1000 then
    raise exception 'จำนวนที่ต้องการต้องเป็นตัวเลข 1-1000';
  end if;

  v_event := private.lock_active_event();
  v_current := private.current_round(v_event.id);
  if v_current.id is null or v_current.id <> p_round_id then
    raise exception 'แก้ได้เฉพาะรอบปัจจุบันเท่านั้น';
  end if;

  v_filled := private.round_filled(v_current.id);
  if p_target < v_filled then
    raise exception 'จำนวนที่ต้องการต้องไม่น้อยกว่าผู้โชคดีที่ได้ไปแล้ว (% คน)', v_filled;
  end if;

  update public.rounds set name = v_name, target = p_target
  where id = v_current.id
  returning * into v_current;

  return private.round_json(v_current);
end;
$$;

create function public.draw_next() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_event public.events;
  v_round public.rounds;
  v_reg public.registrations;
  v_winner public.winners;
begin
  perform private.require_admin();
  v_event := private.lock_active_event();

  v_round := private.current_round(v_event.id);
  if v_round.id is null then raise exception 'ยังไม่ได้เริ่มรอบ กรุณาเริ่มรอบก่อน'; end if;
  if private.round_filled(v_round.id) >= v_round.target then
    raise exception 'รอบนี้ได้ผู้โชคดีครบแล้ว กรุณาเริ่มรอบใหม่';
  end if;

  -- เรียงด้วย gen_random_uuid() (ใช้ pg_strong_random) แทน random() เพื่อให้ทำนายผลไม่ได้
  select r.* into v_reg
  from public.registrations r
  where r.event_id = v_event.id
    and not r.disqualified
    and not exists (select 1 from public.winners w where w.registration_id = r.id)
  order by gen_random_uuid()
  limit 1;

  if not found then raise exception 'ไม่มีผู้มีสิทธิ์เหลือให้สุ่มแล้ว'; end if;

  insert into public.winners (round_id, registration_id)
  values (v_round.id, v_reg.id)
  returning * into v_winner;

  return jsonb_build_object(
    'winner', jsonb_build_object(
      'id', v_winner.id,
      'member_id', v_reg.member_id,
      'full_name', v_reg.full_name,
      'unit', (select name from public.units where id = v_reg.unit_id)
    ),
    'round', private.round_json(v_round),
    'eligible_count', private.eligible_count(v_event.id)
  );
end;
$$;

-- ผู้โชคดีของรอบปัจจุบันในงานที่ active พร้อมล็อกงาน
create function private.lock_current_round_winner(p_winner_id uuid) returns public.winners
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_event public.events;
  v_round public.rounds;
  v_winner public.winners;
begin
  v_event := private.lock_active_event();
  v_round := private.current_round(v_event.id);

  select * into v_winner from public.winners where id = p_winner_id;
  if not found then raise exception 'ไม่พบผู้โชคดีรายนี้'; end if;
  if v_round.id is null or v_winner.round_id <> v_round.id then
    raise exception 'จัดการการสละสิทธิ์ได้เฉพาะผู้โชคดีของรอบปัจจุบันเท่านั้น';
  end if;
  return v_winner;
end;
$$;

create function public.forfeit_winner(p_winner_id uuid) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_winner public.winners;
begin
  perform private.require_admin();
  v_winner := private.lock_current_round_winner(p_winner_id);
  if v_winner.forfeited_at is not null then raise exception 'ผู้โชคดีรายนี้สละสิทธิ์ไปแล้ว'; end if;
  update public.winners set forfeited_at = now() where id = v_winner.id;
end;
$$;

-- ยกเลิกการสละสิทธิ์ได้เฉพาะตอนที่ยังไม่ได้สุ่มคนแทน (รอบยังไม่ครบ)
create function public.undo_forfeit(p_winner_id uuid) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_winner public.winners;
  v_round public.rounds;
begin
  perform private.require_admin();
  v_winner := private.lock_current_round_winner(p_winner_id);
  if v_winner.forfeited_at is null then raise exception 'ผู้โชคดีรายนี้ไม่ได้สละสิทธิ์'; end if;

  select * into v_round from public.rounds where id = v_winner.round_id;
  if private.round_filled(v_round.id) >= v_round.target then
    raise exception 'สุ่มคนแทนไปแล้ว ยกเลิกการสละสิทธิ์ไม่ได้';
  end if;
  update public.winners set forfeited_at = null where id = v_winner.id;
end;
$$;

create function private.lock_active_registration(p_registration_id uuid) returns public.registrations
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_event public.events;
  v_reg public.registrations;
begin
  v_event := private.lock_active_event();
  select * into v_reg from public.registrations where id = p_registration_id and event_id = v_event.id;
  if not found then raise exception 'ไม่พบการลงทะเบียนนี้ในงานปัจจุบัน'; end if;
  return v_reg;
end;
$$;

create function public.disqualify(p_registration_id uuid) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_reg public.registrations;
begin
  perform private.require_admin();
  v_reg := private.lock_active_registration(p_registration_id);
  if exists (select 1 from public.winners where registration_id = v_reg.id) then
    raise exception '% ถูกสุ่มได้แล้ว ตัดสิทธิ์ไม่ได้', v_reg.full_name;
  end if;
  update public.registrations set disqualified = true where id = v_reg.id;
end;
$$;

create function public.requalify(p_registration_id uuid) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_reg public.registrations;
begin
  perform private.require_admin();
  v_reg := private.lock_active_registration(p_registration_id);
  update public.registrations set disqualified = false where id = v_reg.id;
end;
$$;

-- ===== Function privileges =====

revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_admin() to authenticated;

grant execute on function
  public.get_registration_form(),
  public.register(text, text, integer),
  public.get_display_state(),
  public.get_effect_names()
to anon, authenticated;

grant execute on function
  public.get_admin_state(),
  public.create_event(text),
  public.set_registration_open(boolean),
  public.set_display_mode(text),
  public.start_round(text, integer),
  public.update_round(uuid, text, integer),
  public.draw_next(),
  public.forfeit_winner(uuid),
  public.undo_forfeit(uuid),
  public.disqualify(uuid),
  public.requalify(uuid)
to authenticated;

-- ===== Realtime =====
-- จอแสดงผล/หน้าแอดมินฟังการเปลี่ยนแปลงแล้วเรียก get_*_state() ใหม่ (RLS ยังมีผลกับ Realtime)
alter publication supabase_realtime add table
  public.events, public.rounds, public.winners, public.registrations;
