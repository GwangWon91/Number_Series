import { z } from 'zod';
import { definePlugin } from '../plugin';
import { fromDiffs, geometricSeq, range } from './shared';

/** 계차수열: 이웃한 항의 차이가 등비수열 */
export default definePlugin({
  id: 'diff-geometric',
  params: z.object({ start: range, firstDiff: range, ratio: range }),
  generate({ rng, length, params }) {
    const d0 = rng.nonZero(params.firstDiff);
    const r = rng.range(params.ratio);
    if (d0 === 0 || Math.abs(r) < 2) return null;
    return {
      terms: fromDiffs(rng.range(params.start), geometricSeq(d0, r, length - 1)),
      family: 'diff-geometric',
    };
  },
});
