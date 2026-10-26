const THAI = /[฀-๿]/;
const NETWORK = /Failed to fetch|NetworkError|Load failed|fetch failed/i;

/**
 * แปลง error จาก supabase-js เป็นข้อความไทยสำหรับผู้ใช้
 * function ใน DB raise ข้อความไทยอยู่แล้ว จึงส่งต่อได้ตรง ๆ
 */
export function toThaiMessage(err: { message?: string; code?: string } | null | undefined): string {
  const msg = err?.message ?? '';
  if (!msg || NETWORK.test(msg)) return 'เชื่อมต่อระบบไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';
  if (THAI.test(msg)) return msg;
  if (err?.code === 'PGRST301' || /JWT expired/i.test(msg)) return 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่';
  if (/permission denied/i.test(msg)) return 'ไม่มีสิทธิ์ใช้งานส่วนนี้';
  if (/Invalid login credentials/i.test(msg)) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
  return 'เกิดข้อผิดพลาด: ' + msg;
}
