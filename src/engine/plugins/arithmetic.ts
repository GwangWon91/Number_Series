import { z } from 'zod';
import { definePlugin } from '../plugin';
import { arithmeticSeq, range } from './shared';

/** 등차수열: a, a+d, a+2d, … */
export default definePlugin({
  id: 'arithmetic',
  params: z.object({ start: range, diff: range }),
  generate({ rng, length, params }) {
    const d = rng.nonZero(params.diff);
    if (d === 0) return null;
    return { terms: arithmeticSeq(rng.range(params.start), d, length), family: 'arithmetic' };
  },
});
