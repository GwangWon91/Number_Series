import { describe, expect, it } from 'vitest';
import { scoringSchema } from '../../src/game/modes';
import { answer, CHECKPOINT_EVERY, newRun, type Run } from '../../src/game/run';
import { loadModes } from '../../src/node/load';

const scoring = scoringSchema.parse({
  correct: 10,
  difficulty: 2,
  speed: { max: 5, fullSec: 10, zeroSec: 30 },
  combo: { step: 1, cap: 5 },
  wrong: -5,
});
const ok = (run: Run, sec = 60, difficulty = 1, s = scoring) =>
  answer(run, { correct: true, difficulty, elapsedMs: sec * 1000 }, s);
const ng = (run: Run, s = scoring) => answer(run, { correct: false, difficulty: 1, elapsedMs: 1000 }, s);
const gainOf = (r: ReturnType<typeof answer>) => (r.events[0] as { gained: number }).gained;

describe('점수 (scoring)', () => {
  it('정답 = 기본 + 난이도 + 속도(10초 안 만점, 30초부터 0, 사이 선형)', () => {
    expect(gainOf(ok(newRun(), 5, 3))).toBe(10 + 4 + 5);
    expect(gainOf(ok(newRun(), 20))).toBe(10 + 3); // 2.5 → 반올림
    expect(gainOf(ok(newRun(), 40))).toBe(10);
  });

  it('콤보: 연속 정답 2번째부터 +1씩, 최대 +5', () => {
    let run = newRun();
    const gains: number[] = [];
    for (let i = 0; i < 8; i++) {
      const r = ok(run);
      run = r.run;
      gains.push(gainOf(r));
    }
    expect(gains).toEqual([10, 11, 12, 13, 14, 15, 15, 15]);
    expect(run.maxCombo).toBe(8);
  });

  it('오답: 감점하고 콤보 초기화, 세션 점수는 0 아래로 안 내려간다', () => {
    const r1 = ng(newRun());
    expect(r1.events[0]).toEqual({ kind: 'wrong', lostCombo: 0, lost: 0 });
    expect(r1.run.score).toBe(0);
    const r2 = ng(ok(ok(newRun()).run).run);
    expect(r2.events[0]).toEqual({ kind: 'wrong', lostCombo: 2, lost: 5 });
    expect(r2.run).toMatchObject({ score: 16, combo: 0, maxCombo: 2 });
  });

  it('점수 기준이 없으면(무제한 연습) 점수 0, 콤보·정답 수는 센다', () => {
    let run = newRun();
    for (let i = 0; i < 3; i++) run = answer(run, { correct: true, difficulty: 3, elapsedMs: 1 }).run;
    expect(run).toMatchObject({ score: 0, combo: 3, correct: 3, solved: 3 });
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
    expect(checkpoints[1]).toMatchObject({ index: 1, prev: run.checkpoints[0] });
    expect(run.checkpoints.reduce((s, c) => s + c.score, 0)).toBe(run.score);
    expect(run.checkpoints.reduce((s, c) => s + c.correct, 0)).toBe(run.correct);
  });

  it('modes.yaml: 무제한 연습은 점수 없음, 나머지 모드는 점수 기준이 있다', () => {
    const { modes } = loadModes();
    const [practice, ...others] = modes!.modes;
    expect(practice.scoring).toBeUndefined();
    expect(others.every((m) => m.scoring)).toBe(true);
  });
});
