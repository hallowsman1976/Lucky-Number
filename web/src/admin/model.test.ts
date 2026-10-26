import { describe, expect, it } from 'vitest';
import type { AdminRegistration, RoundInfo } from '../lib/types';
import { computeStats, registrationStatus, roundWinners, searchRegistrations, winnersCsvRows } from './model';

const reg = (id: string, extra: Partial<AdminRegistration> = {}): AdminRegistration => ({
  id,
  member_id: '100' + id,
  full_name: 'สมาชิก ' + id,
  unit: 'บำนาญ',
  disqualified: false,
  created_at: '2026-01-01T00:00:00Z',
  winner: null,
  ...extra,
});

const won = (roundId: string, drawnAt: string, forfeited = false) => ({
  id: 'w' + drawnAt,
  round_id: roundId,
  round_name: roundId === 'r1' ? 'ทองคำ' : 'เงิน',
  drawn_at: drawnAt,
  forfeited_at: forfeited ? drawnAt : null,
});

const regs = [
  reg('1'),
  reg('2', { disqualified: true }),
  reg('3', { winner: won('r1', '2026-01-01T00:00:02Z') }),
  reg('4', { winner: won('r1', '2026-01-01T00:00:01Z', true) }),
  reg('5', { winner: won('r2', '2026-01-01T00:00:03Z') }),
];

describe('registrationStatus / computeStats', () => {
  it('derives one status per registration', () => {
    expect(regs.map(registrationStatus)).toEqual(['eligible', 'disqualified', 'winner', 'forfeited', 'winner']);
    expect(computeStats(regs)).toEqual({ total: 5, eligible: 1, disqualified: 1, winner: 2, forfeited: 1 });
  });
});

describe('searchRegistrations', () => {
  it('matches member id or name', () => {
    expect(searchRegistrations(regs, '1003').map((r) => r.id)).toEqual(['3']);
    expect(searchRegistrations(regs, ' สมาชิก 5 ').map((r) => r.id)).toEqual(['5']);
    expect(searchRegistrations(regs, '')).toHaveLength(5);
  });
});

describe('roundWinners', () => {
  it('lists winners of one round in draw order, forfeits included', () => {
    expect(roundWinners(regs, 'r1').map((r) => r.id)).toEqual(['4', '3']);
  });
});

describe('winnersCsvRows', () => {
  it('orders by round then draw time and marks forfeits', () => {
    const rounds: RoundInfo[] = [
      { id: 'r1', seq: 1, name: 'ทองคำ', target: 1, filled: 1 },
      { id: 'r2', seq: 2, name: 'เงิน', target: 1, filled: 1 },
    ];
    const rows = winnersCsvRows(regs, rounds);
    expect(rows.slice(1).map((r) => [r[0], r[3], r[6]])).toEqual([
      [1, 'สมาชิก 4', 'สละสิทธิ์'],
      [1, 'สมาชิก 3', 'ผู้โชคดี'],
      [2, 'สมาชิก 5', 'ผู้โชคดี'],
    ]);
    expect(rows[1]?.[2]).toEqual({ text: '1004' });
  });
});
