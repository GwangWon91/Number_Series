import { z } from 'zod';
import { definePlugin } from '../plugin';
import { arithmeticSeq, fromDiffs, geometricSeq, range, weights } from './shared';

/** 2단계 계차: 차이의 차이가 등차 또는 등비 */
export default definePlugin({
  id: 'diff-second',
  params: z.object({
    variant: weights(['arithmetic', 'geometric']),
    start: range,
    firstDiff: range,
    firstSecond: range,
    secondStep: range,
    secondRatio: range,
  }),
  generate({ rng, length, params }) {
    const variant = rng.weighted(params.variant);
    const s0 = rng.nonZero(params.firstSecond);
    let second: number[];
    if (variant === 'arithmetic') {
      const step = rng.nonZero(params.secondStep);
      if (step === 0) return null;
      second = arithmeticSeq(s0, step, length - 2);
    } else {
      const r = rng.range(params.secondRatio);
      if (Math.abs(r) < 2 || s0 === 0) return null;
      second = geometricSeq(s0, r, length - 2);
    }
    const diffs = fromDiffs(rng.range(params.firstDiff), second);
    return {
      terms: fromDiffs(rng.range(params.start), diffs),
      family: variant === 'arithmetic' ? 'diff-second-arithmetic' : 'diff-second-geometric',
    };
  },
});
