import { z } from 'zod';
import { definePlugin } from '../plugin';
import { arithmeticSeq, fromDiffs, range } from './shared';

/** 계차수열: 이웃한 항의 차이가 등차수열 */
export default definePlugin({
  id: 'diff-arithmetic',
  params: z.object({ start: range, firstDiff: range, diffStep: range }),
  generate({ rng, length, params }) {
    const step = rng.nonZero(params.diffStep);
    if (step === 0) return null;
    const diffs = arithmeticSeq(rng.range(params.firstDiff), step, length - 1);
    return { terms: fromDiffs(rng.range(params.start), diffs), family: 'diff-arithmetic' };
  },
});
