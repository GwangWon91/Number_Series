import { z } from 'zod';
import { rangeSchema } from '../config';
import type { Rng } from '../rng';

export { rangeSchema as range };

export const weights = <K extends string>(keys: readonly [K, ...K[]]) =>
  z.partialRecord(z.enum(keys), z.number().nonnegative());

export function arithmeticSeq(start: number, d: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => start + d * i);
}

export function geometricSeq(start: number, r: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => start * r ** i);
}

/** 첫 항과 차이 수열로 수열을 만든다 */
export function fromDiffs(start: number, diffs: readonly number[]): number[] {
  const out = [start];
  for (const d of diffs) out.push(out[out.length - 1] + d);
  return out;
}

/** 홀짝·분수 수열의 부분 수열용 단순 생성 */
export const simpleKinds = ['arithmetic', 'geometric', 'diffArithmetic'] as const;
export type SimpleKind = (typeof simpleKinds)[number];

export const simpleParams = z.object({
  start: rangeSchema,
  diff: rangeSchema,
  ratio: rangeSchema,
  step: rangeSchema,
});
export type SimpleParams = z.infer<typeof simpleParams>;

export function simpleSeq(rng: Rng, kind: SimpleKind, p: SimpleParams, n: number): number[] | null {
  const start = rng.range(p.start);
  if (kind === 'arithmetic') {
    const d = rng.nonZero(p.diff);
    return d === 0 ? null : arithmeticSeq(start, d, n);
  }
  if (kind === 'geometric') {
    const r = rng.range(p.ratio);
    return Math.abs(r) < 2 || start === 0 ? null : geometricSeq(start, r, n);
  }
  const d0 = rng.range(p.diff);
  const step = rng.nonZero(p.step);
  if (step === 0) return null;
  return fromDiffs(start, arithmeticSeq(d0, step, n - 1));
}
