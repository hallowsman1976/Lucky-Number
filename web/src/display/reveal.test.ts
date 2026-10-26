import { describe, expect, it } from 'vitest';
import type { DisplayWinner } from '../lib/types';
import { takeNewWinners } from './reveal';

const winner = (id: string, drawn_at: string, forfeited = false): DisplayWinner => ({
  id,
  round_id: 'r1',
  round_name: 'ทองคำ',
  full_name: 'คน ' + id,
  unit: 'บำนาญ',
  member_id_masked: '12***',
  drawn_at,
  forfeited,
});

describe('takeNewWinners', () => {
  it('returns unseen winners oldest first and remembers them', () => {
    const seen = new Set<string>(['a']);
    const list = [winner('c', '2026-01-01T00:00:03Z'), winner('b', '2026-01-01T00:00:02Z'), winner('a', '2026-01-01T00:00:01Z')];
    expect(takeNewWinners(seen, list).map((w) => w.id)).toEqual(['b', 'c']);
    expect(takeNewWinners(seen, list)).toEqual([]);
  });

  it('skips winners who forfeited before the screen saw them', () => {
    const seen = new Set<string>();
    expect(takeNewWinners(seen, [winner('x', '2026-01-01T00:00:01Z', true)])).toEqual([]);
    expect(seen.has('x')).toBe(true);
  });
});
