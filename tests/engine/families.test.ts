import { describe, expect, it } from 'vitest';
import { getFamily } from '../../src/engine/families';
import { frac, type Value } from '../../src/engine/value';

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
