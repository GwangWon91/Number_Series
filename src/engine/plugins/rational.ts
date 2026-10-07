import { z } from 'zod';
import { definePlugin } from '../plugin';
import { allInts, mulV, parseValue, rational, type Value } from '../value';
import { simpleParams, simpleSeq, weights } from './shared';

/**
 * 유리수 수열: 정수 규칙 수열을 L로 나눈 것 (1/3, 1/2, 5/6, 4/3, 2 = 6분의 2, 3, 5, 8, 12),
 * 또는 공비가 분수인 등비수열 (8/27, 4/9, 2/3, 1, 3/2). 화면 표기(분수·소수·대분수)는 type의 display.notation.
 */
export default definePlugin({
  id: 'rational',
  params: z.object({
    kinds: weights(['arithmetic', 'diffArithmetic', 'fib', 'geometric'] as const),
    /** 통분 분모 L 후보 (소수 표기를 쓰려면 2·4·5·10 계열) */
    scales: z.array(z.number().int().min(2)).min(1),
    /** ×L 한 정수열의 파라미터 */
    int: simpleParams,
    /** 분수 공비 후보 ("3/2", "2/3", "1/2") */
    ratios: z.array(z.string()).min(1),
  }),
  generate({ rng, length, params }) {
    const kind = rng.weighted(params.kinds);
    if (kind === 'geometric') {
      const r = parseValue(rng.pick(params.ratios));
      // 가운데쯤 항을 정수로 두고 양쪽으로 ×r, ÷r (1을 지나는 실전 형태)
      const k = rng.int(1, length - 2);
      const center = rng.range(params.int.start);
      if (center === 0) return null;
      const terms: Value[] = [];
      for (let i = 0; i < length; i++) {
        let v: Value = center;
        const steps = i - k;
        for (let s = 0; s < Math.abs(steps); s++) v = steps > 0 ? mulV(v, r) : mulV(v, rational(...inv(r)));
        terms.push(v);
      }
      return allInts(terms) ? null : { terms, family: 'rational-geometric' };
    }
    const L = rng.pick(params.scales);
    let ints: number[] | null;
    if (kind === 'fib') {
      const [a, b] = [rng.range(params.int.start), rng.range(params.int.start)];
      ints = [a, b];
      while (ints.length < length) ints.push(ints[ints.length - 1] + ints[ints.length - 2]);
      if (a <= 0 || b <= 0) return null;
    } else {
      ints = simpleSeq(rng, kind, params.int, length);
    }
    if (!ints) return null;
    const terms = ints.map((n) => rational(n, L));
    // 정수만 나오면 다른 유형과 같으므로 버린다
    return terms.filter((v) => typeof v !== 'number').length < 2 ? null : { terms, family: 'rational' };
  },
});

function inv(r: Value): [number, number] {
  return typeof r === 'number' ? [1, r] : [r.d, r.n];
}
