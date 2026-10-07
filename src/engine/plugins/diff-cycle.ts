import { z } from 'zod';
import { definePlugin } from '../plugin';
import { fromDiffs, range } from './shared';

/** 차이가 (+5, −2), (+3, −1, +4)처럼 주기적으로 반복 */
export default definePlugin({
  id: 'diff-cycle',
  params: z.object({ start: range, period: range, diff: range }),
  generate({ rng, length, params }) {
    const period = rng.range(params.period);
    if (period !== 2 && period !== 3) return null;
    const pattern = Array.from({ length: period }, () => rng.nonZero(params.diff));
    if (pattern.some((d) => d === 0) || new Set(pattern).size < 2) return null;
    const diffs = Array.from({ length: length - 1 }, (_, i) => pattern[i % period]);
    return { terms: fromDiffs(rng.range(params.start), diffs), family: `diff-cycle-${period}` };
  },
});
