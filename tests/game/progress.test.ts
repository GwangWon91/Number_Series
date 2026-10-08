import { describe, expect, it } from 'vitest';
import { unlockedIds, weekly, type History } from '../../src/game/progress';
import type { Attempt, Session } from '../../src/store/types';

const session = (p: Partial<Session>): Session => ({
  id: Math.random().toString(36),
  ts: 0,
  endedAt: 0,
  modeId: 'all',
  total: 1,
  correct: 1,
  durationMs: 0,
  appVersion: 't',
  configVersion: 1,
  ...p,
});
const attempt = (p: Partial<Attempt>): Attempt =>
  ({ id: Math.random().toString(36), ts: 0, mode: 'all', typeId: 't', correct: true, elapsedMs: 1000, ...p }) as Attempt;
const ctx = { skills: {}, typeIds: ['a', 'b'] };
const ids = (h: Partial<History>, c = ctx) => unlockedIds({ attempts: [], sessions: [], ...h }, c);

describe('업적', () => {
  it('기록이 없으면 아무것도 없다', () => {
    expect(ids({}).size).toBe(0);
  });
  it('세션 결과로 판정 (무실수 10·콤보·모드별)', () => {
    const got = ids({
      sessions: [
        session({ total: 10, correct: 10, maxCombo: 10 }),
        session({ modeId: 'exam', total: 20, correct: 15 }),
        session({ modeId: 'survival', total: 19, correct: 16 }),
      ],
    });
    expect([...got].sort()).toEqual(['combo-10', 'exam-15', 'first-session', 'perfect-10']);
  });
  it('숙련도: 한 유형 ★3, 모든 유형 ★2', () => {
    const skills = { a: { level: 3, recent: [] }, b: { level: 2, recent: [] } };
    expect(ids({}, { skills, typeIds: ['a', 'b'] })).toEqual(new Set(['type-master', 'all-types-2']));
  });
  it('약점 극복: 처음 10문제 ≤50% → 최근 10문제 ≥80%', () => {
    const xs = [
      ...Array.from({ length: 10 }, (_, i) => attempt({ ts: i, typeId: 'a', correct: i < 5 })),
      ...Array.from({ length: 10 }, (_, i) => attempt({ ts: 100 + i, typeId: 'a', correct: i !== 0 })),
    ];
    expect(ids({ attempts: xs }).has('weak-overcome')).toBe(true);
    expect(ids({ attempts: xs.slice(0, 19) }).has('weak-overcome')).toBe(false);
  });
});

describe('주별 정답률', () => {
  it('최근 8주를 월요일 기준으로 나누고 빈 주도 포함한다', () => {
    const now = new Date(2026, 9, 8, 12).getTime(); // 2026-10-08 (목)
    const monday = new Date(2026, 9, 5).getTime();
    const ws = weekly(
      [
        attempt({ ts: monday + 1000, correct: true, elapsedMs: 2000 }),
        attempt({ ts: now, correct: false, elapsedMs: 4000 }),
        attempt({ ts: monday - 1000, correct: true }),
      ],
      now,
    );
    expect(ws).toHaveLength(8);
    expect(ws[7]).toMatchObject({ start: monday, solved: 2, correct: 1, avgMs: 3000 });
    expect(ws[6].solved).toBe(1);
    expect(ws[0].solved).toBe(0);
  });
});
