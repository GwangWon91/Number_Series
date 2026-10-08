import { describe, expect, it } from 'vitest';
import { analyzeQuestion, ruleSummary } from '../../src/engine/question';
import { judge } from '../../src/engine/solver';
import { parseValue, valueKey } from '../../src/engine/value';

const blank = (terms: (number | string | null)[], answer: number | string) => ({
  terms: terms.map((t) => (t === null ? null : parseValue(t))),
  answer: parseValue(answer),
});

describe('ruleSummary (해설 첫 줄)', () => {
  it('차이가 일정: 매번 +d / −d (빈칸은 정답으로 채워 계산)', () => {
    expect(ruleSummary(blank([3, 6, 9, null, 15], 12))).toBe('매번 +3');
    expect(ruleSummary(blank([20, 17, null, 11, 8], 14))).toBe('매번 −3');
    expect(ruleSummary(blank(['1/4', '1/2', '3/4', null], 1))).toBe('매번 +1/4');
    expect(ruleSummary(blank(['0.5', '1.0', '1.5', null], '2.0'))).toBe('매번 +0.5');
  });
  it('비율이 일정: 매번 ×r / ÷r', () => {
    expect(ruleSummary(blank([2, 6, 18, null, 162], 54))).toBe('매번 ×3');
    expect(ruleSummary(blank([96, 48, 24, null], 12))).toBe('매번 ÷2');
    expect(ruleSummary(blank([8, 12, 18, null], 27))).toBe('매번 ×3/2');
  });
  it('차이의 차이가 일정: 차이가 매번 +k', () => {
    expect(ruleSummary(blank([1, 2, 4, 7, null, 16], 11))).toBe('차이가 매번 +1');
    expect(ruleSummary(blank([10, 13, 19, 31, 55, null], 103))).toBe('차이가 매번 ×2');
  });
  it('그 밖(홀짝·피보나치 등)과 짧은 수열은 요약 없음', () => {
    expect(ruleSummary(blank([1, 1, 2, 3, 5, null], 8))).toBeNull();
    expect(ruleSummary(blank([1, 10, 2, 20, 3, null], 30))).toBeNull();
    expect(ruleSummary(blank([1, 2, null], 3))).toBeNull();
  });
  it('A·B 문항은 A·B 값으로 채워 계산, 값이 없으면 null', () => {
    const terms = [2, 4, null, 8, null, 12].map((t) => t);
    const q = { kind: 'pair' as const, op: '+' as const, blanks: [2, 4] as [number, number] };
    expect(ruleSummary({ terms, answer: 16, question: { ...q, values: [6, 10] } })).toBe('매번 +2');
    expect(ruleSummary({ terms, answer: 16, question: q })).toBeNull();
  });
});

describe('n번째 항 (유리수 이어 쓰기)', () => {
  // 통분한 정수열이 정수가 아닌 다음 항(3 → 1.5)으로 가도 같은 규칙으로 이어 쓰고, 다른 규칙 값이 끼어들지 않는다
  const nth = (terms: (number | string)[], n: number) => {
    const v = judge(analyzeQuestion(terms.map(parseValue), { kind: 'nth', n }), parseValue(0), 0, 1);
    return [...new Set([...v.supporting, ...v.alternatives].map((e) => valueKey(e.value)))];
  };
  it('÷2 등비: 6, 3, 1.5, 3/4 → 7번째 3/32 하나만', () => {
    expect(nth([6, 3, '1.5', '3/4'], 7)).toEqual([valueKey(parseValue('3/32'))]);
  });
  it('차이가 ÷2: 7/4, 3/2, 11/8, 21/16 → 6번째 81/64 하나만', () => {
    expect(nth(['7/4', '3/2', '11/8', '21/16'], 6)).toEqual([valueKey(parseValue('81/64'))]);
  });
});
