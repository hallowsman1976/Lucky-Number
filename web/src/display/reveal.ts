import type { DisplayWinner } from '../lib/types';

/**
 * ผู้โชคดีที่จอยังไม่เคยเห็น (เก่าสุดก่อน) เพื่อเล่นวงล้อ + เปิดชื่อทีละคน
 * ใส่ id ลงใน seen ไปด้วย คนที่สละสิทธิ์ก่อนจอจะเห็นจะไม่ถูกเปิดชื่อ
 */
export function takeNewWinners(seen: Set<string>, winners: readonly DisplayWinner[]): DisplayWinner[] {
  const fresh = winners.filter((w) => !seen.has(w.id));
  for (const w of fresh) seen.add(w.id);
  return fresh
    .filter((w) => !w.forfeited)
    .sort((a, b) => (a.drawn_at < b.drawn_at ? -1 : a.drawn_at > b.drawn_at ? 1 : 0));
}
