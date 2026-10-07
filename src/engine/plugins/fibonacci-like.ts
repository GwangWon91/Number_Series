import { z } from 'zod';
import { definePlugin } from '../plugin';
import { range, weights } from './shared';

/** 앞의 항들로 다음 항을 만드는 수열 (합, 합+상수, 세 항 합, 곱) */
export default definePlugin({
  id: 'fibonacci-like',
  params: z.object({
    variant: weights(['sum', 'sumConst', 'tribonacci', 'product']),
    start: range,
    productStart: range,
    constant: range,
  }),
  generate({ rng, length, params }) {
    const variant = rng.weighted(params.variant);
    const order = variant === 'tribonacci' ? 3 : 2;
    const startRange = variant === 'product' ? params.productStart : params.start;
    const terms = Array.from({ length: order }, () => rng.range(startRange));
    // 1·1로 시작하는 곱 수열은 1만 반복되므로 버린다
    if (variant === 'product' && terms.every((v) => Math.abs(v) <= 1)) return null;
    const c = variant === 'sumConst' ? rng.nonZero(params.constant) : 0;
    if (variant === 'sumConst' && c === 0) return null;
    while (terms.length < length) {
      const w = terms.slice(-order);
      terms.push(variant === 'product' ? w[0] * w[1] : w.reduce((s, v) => s + v, 0) + c);
    }
    const family = {
      sum: 'fib-sum',
      sumConst: 'fib-sum-const',
      tribonacci: 'tribonacci',
      product: 'fib-product',
    }[variant];
    return { terms, family };
  },
});
