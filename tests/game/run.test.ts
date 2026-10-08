import { describe, expect, it } from 'vitest';
import { answer, CHECKPOINT_EVERY, newRun, type Run } from '../../src/game/run';

const LIMIT = 45_000;
const ok = (run: Run, elapsedMs = LIMIT, difficulty = 1) => answer(run, { correct: true, difficulty, elapsedMs, limitMs: LIMIT });
const ng = (run: Run) => answer(run, { correct: false, difficulty: 1, elapsedMs: 1000, limitMs: LIMIT });

describe('run.answer', () => {
  it('정답: 기본 + 난이도 + 속도 보너스, 첫 정답은 배율 ×1', () => {
    const { run, events } = ok(newRun(), 0, 3);
    expect(events[0]).toMatchObject({ kind: 'correct', gained: 100 + 100 + 50, combo: 1, multiplier: 1 });
    expect(run).toMatchObject({ score: 250, combo: 1, maxCombo: 1, solved: 1, correct: 1 });
  });

  it('속도 보너스는 기준 시간을 넘으면 0 (음수 아님)', () => {
    expect(ok(newRun(), LIMIT * 2).events[0]).toMatchObject({ speedBonus: 0, gained: 100 });
  });

  it('콤보 배율은 이전 연속 정답만큼 오르고 ×2에서 멈춘다', () => {
    let run = newRun();
    const gains: number[] = [];
    for (let i = 0; i < 15; i++) {
      const r = ok(run);
      run = r.run;
      gains.push((r.events[0] as { gained: number }).gained);
    }
    expect(gains.slice(0, 3)).toEqual([100, 110, 120]);
    expect(gains[10]).toBe(200);
    expect(gains[14]).toBe(200);
    expect(run.maxCombo).toBe(15);
  });

  it('오답: 0점, 감점 없음, 콤보 초기화 (최고 콤보는 유지)', () => {
    let run = ok(ok(newRun()).run).run;
    const r = ng(run);
    expect(r.events[0]).toEqual({ kind: 'wrong', lostCombo: 2 });
    expect(r.run).toMatchObject({ score: run.score, combo: 0, maxCombo: 2, solved: 3, correct: 2 });
    run = ok(r.run).run;
    expect(run.combo).toBe(1);
  });

  it(`${CHECKPOINT_EVERY}문제마다 구간 결과를 남기고 이전 구간과 비교할 수 있다`, () => {
    let run = newRun();
    const checkpoints = [];
    for (let i = 0; i < CHECKPOINT_EVERY * 2; i++) {
      const r = i % 3 === 0 ? ng(run) : ok(run);
      run = r.run;
      checkpoints.push(...r.events.filter((e) => e.kind === 'checkpoint'));
    }
    expect(checkpoints).toHaveLength(2);
    expect(checkpoints[0]).toMatchObject({ index: 0, prev: undefined });
    expect(checkpoints[1]).toMatchObject({ index: 1, prev: run.checkpoints[0] });
    expect(run.checkpoints.reduce((s, c) => s + c.score, 0)).toBe(run.score);
    expect(run.checkpoints.reduce((s, c) => s + c.correct, 0)).toBe(run.correct);
  });
});
