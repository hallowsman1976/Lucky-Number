-- ข้อมูลสำหรับ local dev เท่านั้น (supabase db reset) — ห้ามรันบน production
-- แอดมินทดสอบ: admin@example.test / nT7k5qfOH4X9

do $$
declare
  v_uid uuid := 'a0000000-0000-4000-8000-000000000001';
  v_event uuid;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
    'admin@example.test', extensions.crypt('nT7k5qfOH4X9', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  );
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), v_uid, v_uid::text,
    jsonb_build_object('sub', v_uid::text, 'email', 'admin@example.test', 'email_verified', true),
    'email', now(), now(), now()
  );
  insert into public.admins (user_id) values (v_uid);

  insert into public.events (title) values ('จับรางวัลผู้โชคดี สหกรณ์ออมทรัพย์สาธารณสุขมุกดาหาร (ทดสอบ)')
  returning id into v_event;

  insert into public.registrations (event_id, member_id, full_name, unit_id)
  select v_event,
         lpad((1000 + g)::text, 5, '0'),
         'สมาชิกทดสอบ ' || g,
         ((g - 1) % 9) + 1
  from generate_series(1, 40) g;
end;
$$;
