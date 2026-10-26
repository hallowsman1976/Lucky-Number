import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('ยังไม่ได้ตั้งค่า VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (ดู web/.env.example)');
}

// anon key เปิดเผยได้ — ความปลอดภัยอยู่ที่ RLS และ Postgres functions (ADR 0001)
export const supabase = createClient(url, anonKey);
