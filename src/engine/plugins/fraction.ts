import { z } from 'zod';
import { definePlugin } from '../plugin';
import { frac } from '../value';
import { simpleKinds, simpleParams, simpleSeq, weights } from './shared';

/** 분수 수열: 분자와 분모가 각각 규칙을 따른다 (약분하지 않고 표시) */
export default definePlugin({
  id: 'fraction',
  params: z.object({
    kinds: weights(simpleKinds),
    numerator: simpleParams,
    denominator: simpleParams,
  }),
  generate({ rng, length, params }) {
    const ns = simpleSeq(rng, rng.weighted(params.kinds), params.numerator, length);
    const ds = simpleSeq(rng, rng.weighted(params.kinds), params.denominator, length);
    if (!ns || !ds || ds.some((d) => d <= 0)) return null;
    return { terms: ns.map((n, i) => frac(n, ds[i])), family: 'fraction' };
  },
});
