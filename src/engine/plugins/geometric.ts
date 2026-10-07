import { z } from 'zod';
import { definePlugin } from '../plugin';
import { geometricSeq, range } from './shared';

/** 등비수열: ×r 또는 (뒤집어서) ÷r */
export default definePlugin({
  id: 'geometric',
  params: z.object({
    start: range,
    ratio: range,
    /** ÷r 형태(감소)로 낼 확률 */
    divide: z.number().min(0).max(1),
    /** 음수 공비(×(−2) 등)로 낼 확률 */
    negative: z.number().min(0).max(1),
  }),
  generate({ rng, length, params }) {
    let r = rng.range(params.ratio);
    if (Math.abs(r) < 2) return null;
    if (rng.chance(params.negative)) r = -r;
    const terms = geometricSeq(rng.nonZero(params.start), r, length);
    return { terms: rng.chance(params.divide) ? terms.reverse() : terms, family: 'geometric' };
  },
});
