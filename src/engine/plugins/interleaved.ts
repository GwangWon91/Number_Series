import { z } from 'zod';
import { definePlugin } from '../plugin';
import { simpleKinds, simpleParams, simpleSeq, weights } from './shared';

/** 홀수 번째 항과 짝수 번째 항이 각각 다른 규칙 */
export default definePlugin({
  id: 'interleaved',
  params: z.object({
    kinds: weights(simpleKinds),
    odd: simpleParams,
    even: simpleParams,
  }),
  generate({ rng, length, params }) {
    const a = simpleSeq(rng, rng.weighted(params.kinds), params.odd, Math.ceil(length / 2));
    const b = simpleSeq(rng, rng.weighted(params.kinds), params.even, Math.floor(length / 2));
    if (!a || !b) return null;
    const terms = Array.from({ length }, (_, i) => (i % 2 === 0 ? a[i / 2] : b[(i - 1) / 2]));
    return { terms, family: 'interleaved' };
  },
});
