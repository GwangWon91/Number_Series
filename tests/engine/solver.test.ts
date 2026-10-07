import { describe, expect, it } from 'vitest';
import { analyze, judge } from '../../src/engine/solver';
import type { Value } from '../../src/engine/value';

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

  it('빈칸이 1개가 아니면 오류', () => {
    expect(() => analyze([1, 2, 3])).toThrow();
    expect(() => analyze([1, null, null])).toThrow();
  });
});
