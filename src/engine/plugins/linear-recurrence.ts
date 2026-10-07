import { z } from 'zod';
import { definePlugin } from '../plugin';
import { range, weights } from './shared';

/** 앞 항에 연산을 적용: ×a+b (affine) 또는 두 연산 번갈아 (alternating) */
export default definePlugin({
  id: 'linear-recurrence',
  params: z.object({
    variant: weights(['affine', 'alternating']),
    start: range,
    mul: range,
    add: range,
  }),
  generate({ rng, length, params }) {
    const variant = rng.weighted(params.variant);
    const p = rng.range(params.mul);
    const q = rng.nonZero(params.add);
    if (p < 2 || q === 0) return null;
    const start = rng.range(params.start);
    // 0에서 시작하거나 고정점(start = start×p+q)이면 같은 값이 반복되어 규칙이 드러나지 않는다
    if (start === 0 || start * p + q === start) return null;
    const terms = [start];
    if (variant === 'affine') {
      while (terms.length < length) terms.push(terms[terms.length - 1] * p + q);
      return { terms, family: 'affine' };
    }
    const mulFirst = rng.chance(0.5);
    for (let i = 0; terms.length < length; i++) {
      const prev = terms[terms.length - 1];
      terms.push((i % 2 === 0) === mulFirst ? prev * p : prev + q);
    }
    if (terms.includes(0)) return null;
    return { terms, family: 'alternating-ops' };
  },
});
