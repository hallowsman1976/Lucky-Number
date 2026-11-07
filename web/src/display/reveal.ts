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

/**
 * รวมผู้โชคดี (เรียงเก่าสุดก่อน) เป็นชุดตามการสุ่มแต่ละครั้ง
 * คนที่สุ่มพร้อมกันด้วย draw_many() มีรอบและ drawn_at เดียวกัน ในชุดเรียงตามชื่อให้หาง่าย
 */
export function groupDraws(winners: readonly DisplayWinner[]): DisplayWinner[][] {
  const groups: DisplayWinner[][] = [];
  for (const w of winners) {
    const last = groups.at(-1);
    const head = last?.[0];
    if (last && head && head.round_id === w.round_id && head.drawn_at === w.drawn_at) last.push(w);
    else groups.push([w]);
  }
  for (const g of groups) g.sort((a, b) => a.full_name.localeCompare(b.full_name, 'th', { numeric: true }));
  return groups;
}
