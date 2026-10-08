import { describe, expect, it } from 'vitest';
import { getFamily } from '../../src/engine/families';
import { eqNum, formatValue, frac, parseValue, type Value } from '../../src/engine/value';

const fits = (id: string, seq: Value[]) => getFamily(id).fit(seq, null);
const cands = (id: string, seq: (Value | null)[]) => getFamily(id).candidates(seq, seq.indexOf(null));

describe('규칙 계열 판정', () => {
  it.each([
    ['arithmetic', [3, 7, 11, 15, 19]],
    ['geometric', [2, 6, 18, 54, 162]],
    ['geometric', [486, 162, 54, 18, 6]],
    ['diff-arithmetic', [1, 2, 4, 7, 11, 16]],
    ['diff-geometric', [1, 2, 4, 8, 16, 32]],
    ['diff-geometric', [5, 6, 8, 12, 20, 36]],
    ['diff-second-arithmetic', [1, 2, 4, 8, 15, 26, 42]],
    ['diff-cycle-2', [10, 15, 13, 18, 16, 21, 19]],
    ['affine', [1, 3, 7, 15, 31, 63]],
    ['alternating-ops', [2, 4, 7, 14, 17, 34, 37]],
    ['power', [2, 5, 10, 17, 26, 37]],
    ['fib-sum', [1, 2, 3, 5, 8, 13, 21]],
    ['fib-sum-const', [1, 2, 4, 7, 12, 20]],
    ['tribonacci', [1, 1, 2, 4, 7, 13, 24]],
    ['fib-product', [1, 2, 2, 4, 8, 32]],
    ['interleaved', [1, 10, 3, 20, 5, 40, 7, 80]],
    ['grouped', [2, 3, 5, 4, 1, 5, 6, 7, 13]],
  ] as const)('%s: %j', (id, seq) => {
    expect(fits(id, [...seq])).not.toBeNull();
  });

  it('분수 수열은 분자·분모를 따로 판정한다', () => {
    expect(fits('fraction', [frac(1, 2), frac(2, 4), frac(3, 8), frac(4, 16), frac(5, 32)])).not.toBeNull();
  });

  it('규칙에 맞지 않으면 null', () => {
    expect(fits('arithmetic', [1, 2, 4, 7])).toBeNull();
    expect(fits('geometric', [2, 6, 18, 50])).toBeNull();
    expect(fits('grouped', [2, 3, 5, 4, 1, 6, 6, 7, 13])).toBeNull();
  });

  it('여유 항 수 = 항 수 − 파라미터 수 (빈칸이면 −1)', () => {
    expect(getFamily('arithmetic').fit([1, 3, 5, 7, 9], null)!.redundancy).toBe(3);
    expect(getFamily('arithmetic').fit([1, 3, 5, 7, 9], 4)!.redundancy).toBe(2);
  });

  it('빈칸 후보: 끝·가운데 모두 예측', () => {
    expect(cands('diff-arithmetic', [1, 2, 4, 7, 11, null])).toContain(16);
    expect(cands('diff-arithmetic', [1, 2, 4, null, 11, 16, 22])).toContain(7);
    expect(cands('affine', [1, 3, 7, null, 31, 63])).toContain(15);
    expect(cands('interleaved', [1, 10, 3, 20, 5, 40, 7, null])).toContain(80);
    expect(cands('grouped', [2, 3, 5, 4, 1, 5, 6, null, 13])).toContain(7);
    expect(cands('fib-sum', [1, 2, 3, null, 8, 13])).toContain(5);
  });
});

describe('유리수·소수·대분수 (실전 형식의 예시 — 숫자는 새로 만든 것)', () => {
  const p = (xs: (string | number | null)[]) => xs.map((x) => (x === null ? null : parseValue(x)));
  const has = (vs: Value[], want: string) => vs.some((v) => eqNum(v, parseValue(want)));

  it('표기 파싱·출력: 소수 자릿수와 대분수 유지', () => {
    expect(formatValue(parseValue('2.70'))).toBe('2.70');
    expect(formatValue(parseValue('1 1/4'))).toBe('1 1/4');
    expect(eqNum(parseValue('0.5'), frac(2, 4))).toBe(true);
    expect(eqNum(parseValue('1 1/4'), frac(5, 4))).toBe(true);
  });

  it.each([
    ['통분 후 계차 (1/4, 1/2, 1, 7/4 …)', ['1/4', '1/2', 1, '7/4', '11/4', null, '11/2'], '4'],
    ['소수 피보나치 (0.3, 0.8, 1.1 …)', ['0.3', '0.8', '1.1', '1.9', '3.0', '4.9', '7.9', null], '12.8'],
    ['분수·소수·대분수 혼용 피보나치', ['1/2', 1, '1.5', '2 1/2', 4, null, '10.5'], '6.5'],
    ['통분 후 홀짝 (약분 표기 1)', ['1/3', '1/8', 1, '3/8', '5/3', null, '7/3', '7/8', 3], '5/8'],
  ])('rational: %s', (_, seq, want) => {
    const s = p(seq);
    expect(has(cands('rational', s), want)).toBe(true);
  });

  it('분수 공비 등비: ×3/2, ×1.5, ×2/3', () => {
    expect(fits('rational-geometric', p(['4/9', '2/3', 1, '3/2', '9/4']) as Value[])).not.toBeNull();
    expect(has(cands('rational-geometric', p(['2.4', '3.6', null, '8.1'])), '5.4')).toBe(true);
    expect(fits('rational-geometric', [32, 48, 72, 108, 162])).not.toBeNull();
    expect(fits('rational-geometric', [2, 6, 18, 54])).toBeNull(); // 정수 공비는 geometric 담당
  });

  it('분수 부분수열에 ×a+b, 홀짝 부분수열에 앞 두 항의 합', () => {
    expect(fits('fraction', p(['1/3', '1/5', '1/9', '1/17', '1/33']) as Value[])).not.toBeNull();
    expect(fits('interleaved', [1, 2, 4, 3, 5, 5, 9, 8, 14, 13])).not.toBeNull();
  });

  it('추가 규칙: 연산 순환·±제곱 계차·비 등차·군수열 둘째 자리 결과', () => {
    expect(fits('op-cycle-4', [8, 24, 4, 2, 52, 156, 136, 68, 118, 354])).not.toBeNull();
    expect(has(cands('rational', p(['0.8', '2.4', '0.4', '0.2', '5.2', '15.6', '13.6', '6.8', '11.8', null])), '35.4')).toBe(true);
    expect(fits('diff-alt-square', [30, 31, 27, 36, 20, 45, 9])).not.toBeNull();
    expect(has(cands('ratio-progression', p([2, 1, '1/3', '1/12', '1/60', null])), '1/360')).toBe(true);
    expect(fits('ratio-progression', [1, 2, 6, 24, 120])).not.toBeNull();
    expect(has(cands('grouped', p(['0.4', '1.9', '1.5', '1.3', '3.1', '1.8', '0.6', null, '2.7'])), '3.3')).toBe(true);
    expect(has(cands('grouped', p(['1/4', '0.2', '4/5', '3/4', '1.2', '8/5', '3/5', null, '1/2'])), '0.3')).toBe(true);
  });

  it('소수 표기는 분자·분모 분리(fraction)로 해석하지 않는다', () => {
    expect(fits('fraction', p(['0.3', '0.8', '1.1', '1.9']) as Value[])).toBeNull();
  });
});
