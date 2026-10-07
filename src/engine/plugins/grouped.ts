import { z } from 'zod';
import type { GroupOp } from '../families/combinators';
import { GROUP_OPS } from '../families/combinators';
import { definePlugin } from '../plugin';
import { range, weights } from './shared';

/** 군수열: 3개씩 묶어 (첫째 ○ 둘째 = 셋째). 항 개수는 묶음 수 × 3으로 정해진다. */
export default definePlugin({
  id: 'grouped',
  params: z.object({
    groups: range,
    ops: weights(['add', 'sub', 'mul', 'div']),
    operand: range,
  }),
  generate({ rng, params }) {
    const op: GroupOp = rng.weighted(params.ops);
    const groups = rng.range(params.groups);
    const terms: number[] = [];
    for (let g = 0; g < groups; g++) {
      let a = rng.range(params.operand);
      let b = rng.range(params.operand);
      if (op === 'sub' && a < b) [a, b] = [b, a];
      if (op === 'sub' && a === b) return null; // 0이 나오는 묶음은 단서가 약하다
      if (op === 'div') {
        if (b === 0) return null;
        a = a * b; // a ÷ b 가 나누어떨어지도록
      }
      const c = GROUP_OPS[op].apply(a, b);
      if (c === null) return null;
      terms.push(a, b, c);
    }
    return { terms, family: 'grouped', groupSize: 3 };
  },
});
