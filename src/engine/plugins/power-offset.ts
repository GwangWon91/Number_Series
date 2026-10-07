import { z } from 'zod';
import { definePlugin } from '../plugin';
import { range, weights } from './shared';

/** 제곱수·세제곱수에 상수를 더한 수열: (b+i)^p + c */
export default definePlugin({
  id: 'power-offset',
  params: z.object({ base: range, power: weights(['2', '3']), offset: range }),
  generate({ rng, length, params }) {
    const b = rng.range(params.base);
    const p = Number(rng.weighted(params.power));
    const c = rng.range(params.offset);
    return { terms: Array.from({ length }, (_, i) => (b + i) ** p + c), family: 'power' };
  },
});
