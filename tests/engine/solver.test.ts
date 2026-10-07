import { describe, expect, it } from 'vitest';
import { analyzeQuestion } from '../../src/engine/question';
import { analyze, judge } from '../../src/engine/solver';
import { frac, parseValue, type Value } from '../../src/engine/value';

const verdict = (seq: (Value | null)[], answer: Value) => judge(analyze(seq, [answer]), answer, 2, 1);

describe('정답 유일성 검사', () => {
  it('규칙이 하나로 확정되면 다른 해석이 없다', () => {
    const v = verdict([1, 3, 7, 15, 31, null], 63);
    expect(v.supporting.length).toBeGreaterThan(0);
    expect(v.alternatives).toEqual([]);
  });

  it('항이 부족해 다른 규칙으로도 읽히면 모호로 판정한다', () => {
    // 3, 9, 27, 81, ? → ×3 (243) 이지만 "×3, +18 번갈아"로 읽으면 99
    const v = verdict([3, 9, 27, 81, null], 243);
    expect(v.alternatives.map((a) => a.value)).toContain(99);
  });

  it('여유 항이 0인 해석(아무 수열에나 끼워 맞춰지는 것)은 무시한다', () => {
    const v = verdict([2, 4, 6, 8, 10, 12, null], 14);
    expect(v.alternatives).toEqual([]);
  });

  it('정답 규칙의 여유 항이 부족하면 supporting이 비어 있다', () => {
    expect(verdict([2, 4, null], 6).supporting).toEqual([]);
  });

  it('A·B 문항: (A, B)를 함께 찾아 연산값으로 판정 (2026H2-1 98: 4, 9, 13, 22, A, 57, 92, B → A+B)', () => {
    const seq = [4, 9, 13, 22, null, 57, 92, null];
    const a = analyzeQuestion(seq, { kind: 'pair', op: '+', blanks: [4, 7] });
    const v = judge(a, 184, 1, 1);
    expect(v.supporting.some((e) => e.pair?.[0] === 35 && e.pair?.[1] === 149)).toBe(true);
    expect(v.alternatives).toEqual([]);
  });

  it('n번째 항: 계열마다 이어 붙여 값을 낸다 (12, 6, 3, 1.5, 3/4 → 8번째 3/32)', () => {
    const seq = [12, 6, 3, parseValue('1.5'), frac(3, 4)];
    const v = judge(analyzeQuestion(seq, { kind: 'nth', n: 8 }), frac(3, 32), 1, 9);
    expect(v.supporting.length).toBeGreaterThan(0);
  });

  it('빈칸이 1개가 아니면 오류', () => {
    expect(() => analyze([1, 2, 3])).toThrow();
    expect(() => analyze([1, null, null])).toThrow();
  });
});
