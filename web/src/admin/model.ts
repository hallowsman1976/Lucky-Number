import type { Cell } from '../lib/csv';
import { formatDateTime } from '../lib/format';
import type { AdminRegistration, RoundInfo } from '../lib/types';

export type RegistrationStatus = 'eligible' | 'disqualified' | 'winner' | 'forfeited';

export const STATUS_LABEL: Record<RegistrationStatus, string> = {
  eligible: 'มีสิทธิ์',
  disqualified: 'ตัดสิทธิ์',
  winner: 'ผู้โชคดี',
  forfeited: 'สละสิทธิ์',
};

export function registrationStatus(r: AdminRegistration): RegistrationStatus {
  if (r.winner) return r.winner.forfeited_at ? 'forfeited' : 'winner';
  return r.disqualified ? 'disqualified' : 'eligible';
}

export type Stats = Record<RegistrationStatus | 'total', number>;

export function computeStats(registrations: readonly AdminRegistration[]): Stats {
  const stats: Stats = { total: registrations.length, eligible: 0, disqualified: 0, winner: 0, forfeited: 0 };
  for (const r of registrations) stats[registrationStatus(r)] += 1;
  return stats;
}

export function searchRegistrations(
  registrations: readonly AdminRegistration[],
  query: string,
): AdminRegistration[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...registrations];
  return registrations.filter((r) => r.member_id.includes(q) || r.full_name.toLowerCase().includes(q));
}

/** ผู้โชคดีของรอบ (รวมคนที่สละสิทธิ์) เรียงตามเวลาที่ถูกสุ่ม */
export function roundWinners(registrations: readonly AdminRegistration[], roundId: string): AdminRegistration[] {
  return registrations
    .filter((r) => r.winner?.round_id === roundId)
    .sort((a, b) => (a.winner!.drawn_at < b.winner!.drawn_at ? -1 : a.winner!.drawn_at > b.winner!.drawn_at ? 1 : 0));
}

export function registrationsCsvRows(registrations: readonly AdminRegistration[]): Cell[][] {
  return [
    ['ลำดับ', 'เวลาลงทะเบียน', 'เลขสมาชิก', 'ชื่อ-นามสกุล', 'หน่วยงาน', 'สถานะ', 'รอบที่ถูกสุ่ม', 'เวลาที่ถูกสุ่ม'],
    ...registrations.map((r, i): Cell[] => [
      i + 1,
      formatDateTime(r.created_at),
      { text: r.member_id },
      r.full_name,
      r.unit,
      STATUS_LABEL[registrationStatus(r)],
      r.winner?.round_name ?? '',
      formatDateTime(r.winner?.drawn_at),
    ]),
  ];
}

export function winnersCsvRows(registrations: readonly AdminRegistration[], rounds: readonly RoundInfo[]): Cell[][] {
  const seqOf = new Map(rounds.map((r) => [r.id, r.seq]));
  const winners = registrations
    .filter((r) => r.winner)
    .sort((a, b) => {
      const bySeq = (seqOf.get(a.winner!.round_id) ?? 0) - (seqOf.get(b.winner!.round_id) ?? 0);
      return bySeq || (a.winner!.drawn_at < b.winner!.drawn_at ? -1 : 1);
    });
  return [
    ['รอบที่', 'ชื่อรอบ', 'เลขสมาชิก', 'ชื่อ-นามสกุล', 'หน่วยงาน', 'เวลาที่ถูกสุ่ม', 'สถานะ'],
    ...winners.map((r): Cell[] => [
      seqOf.get(r.winner!.round_id) ?? '',
      r.winner!.round_name,
      { text: r.member_id },
      r.full_name,
      r.unit,
      formatDateTime(r.winner!.drawn_at),
      r.winner!.forfeited_at ? 'สละสิทธิ์' : 'ผู้โชคดี',
    ]),
  ];
}
