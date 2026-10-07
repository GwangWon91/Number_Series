import type { DistractorStrategy } from './config';
import type { Rng } from './rng';
import { addV, eqNum, frac, isFrac, mulV, rational, reducedDen, subV, toNumber, type Frac, type Value } from './value';

/**
 * 오답 선택지 후보를 넉넉히 만든다. 최종 선택(다른 해석으로 설명되는 값 제외)은 compose가 한다.
 *  - near: 정답 ±1~5
 *  - step: 정답 ± 이웃 항 간격
 *  - mistake: 흔한 실수 (이웃 두 항의 차이를 그대로 이어 붙인 값 등)
 *  - digit: 자릿수 실수 (±10, ±100, 숫자 뒤집기)
 */
export function distractorPool(
  rng: Rng,
  seq: readonly (Value | null)[],
  blank: number,
  answer: Value,
  weights: Partial<Record<DistractorStrategy, number>>,
  size: number,
): Value[] {
  const out: Value[] = [];
  for (let i = 0; i < size * 4 && out.length < size; i++) {
    const strategy = rng.weighted(weights);
    const known = seq.filter((v): v is Value => v !== null);
    const allPlainFrac = isFrac(answer) && known.every((v) => isFrac(v) && !v.fmt);
    const v = allPlainFrac
      ? fracDistractor(rng, strategy, seq as (Frac | null)[], blank, answer as Frac)
      : isFrac(answer) || known.some(isFrac)
        ? ratDistractor(rng, strategy, seq, blank, answer)
        : intDistractor(rng, strategy, seq as (number | null)[], blank, answer as number);
    if (v === null || eqNum(v, answer) || out.some((o) => eqNum(o, v))) continue;
    if (!plausible(v, answer)) continue;
    out.push(v);
  }
  return out;
}

/** 정답과 너무 동떨어진 값은 바로 소거되므로 오답으로 쓰지 않는다 */
const close = (v: number, a: number) => Math.abs(v - a) <= Math.max(12, Math.abs(a) * 0.5);

function plausible(v: Value, answer: Value): boolean {
  if (isFrac(v) && isFrac(answer)) {
    return v.d > 0 && (answer.n <= 0 || v.n > 0) && close(v.n, answer.n) && close(v.d, answer.d);
  }
  if (typeof v === 'number' && typeof answer === 'number') {
    return (answer <= 0 || v > 0) && close(v, answer);
  }
  // 유리수(정수·분수 혼합): 값으로 비교
  const [x, a] = [toNumber(v), toNumber(answer)];
  return (a <= 0 || x > 0) && Math.abs(x - a) <= Math.max(1, Math.abs(a) * 0.5);
}

/**
 * 유리수 수열 오답: 정답 ± 1/L (L = 수열의 공통분모), ± 이웃 간격, 간격을 한 번 더 적용, 자릿수(×10·÷10) 실수.
 */
function ratDistractor(
  rng: Rng,
  strategy: DistractorStrategy,
  seq: readonly (Value | null)[],
  blank: number,
  answer: Value,
): Value | null {
  const known = [...seq.filter((v): v is Value => v !== null), answer];
  const L = known.reduce<number>((l, v) => lcm(l, reducedDen(v)), 1);
  const sign = rng.chance(0.5) ? 1 : -1;
  const unit = (k: number) => rational(sign * k, Math.min(L, 100));
  const at = (i: number) => (i >= 0 && i < seq.length ? seq[i] : null);
  const [l1, l2] = [at(blank - 1), at(blank - 2)];
  const gap = l1 !== null && l2 !== null ? subV(l1, l2) : null;
  switch (strategy) {
    case 'near':
      return addV(answer, unit(rng.int(1, 3)));
    case 'step':
      return gap ? (sign > 0 ? addV(answer, gap) : subV(answer, gap)) : addV(answer, unit(2));
    case 'mistake':
      return gap && l1 !== null ? addV(l1, gap) : addV(answer, unit(rng.int(2, 5)));
    case 'digit':
      return rng.chance(0.5) ? addV(answer, sign) : mulV(answer, rng.chance(0.5) ? 10 : frac(1, 10));
  }
}

const lcm = (a: number, b: number) => {
  const g = (x: number, y: number): number => (y === 0 ? x : g(y, x % y));
  return (a / g(a, b)) * b;
};

/** blank 주변의 알려진 이웃 차이 (왼쪽 우선) */
function neighborGaps(seq: readonly (number | null)[], blank: number): number[] {
  const gaps: number[] = [];
  const at = (i: number) => (i >= 0 && i < seq.length ? seq[i] : null);
  const l1 = at(blank - 1), l2 = at(blank - 2), r1 = at(blank + 1), r2 = at(blank + 2);
  if (l1 !== null && l2 !== null) gaps.push(l1 - l2);
  if (r1 !== null && r2 !== null) gaps.push(r2 - r1);
  return gaps;
}

function intDistractor(
  rng: Rng,
  strategy: DistractorStrategy,
  seq: readonly (number | null)[],
  blank: number,
  answer: number,
): number | null {
  const sign = rng.chance(0.5) ? 1 : -1;
  const gaps = neighborGaps(seq, blank);
  switch (strategy) {
    case 'near':
      return answer + sign * rng.int(1, 5);
    case 'step': {
      const g = gaps.length ? Math.abs(rng.pick(gaps)) : 0;
      const unit = Math.max(1, rng.chance(0.5) ? g : Math.round(g / 2));
      return answer + sign * unit;
    }
    case 'mistake': {
      // 이웃 차이를 그대로 한 번 더 적용한 값 (규칙이 변한다는 걸 놓친 경우)
      const l1 = seq[blank - 1];
      const r1 = seq[blank + 1];
      if (gaps.length && l1 !== null && l1 !== undefined && rng.chance(0.6)) return l1 + gaps[0];
      if (gaps.length > 1 && r1 !== null && r1 !== undefined) return r1 - gaps[gaps.length - 1];
      return answer + sign * rng.int(2, 9);
    }
    case 'digit': {
      if (Math.abs(answer) >= 10 && rng.chance(0.4)) {
        const rev = Number(String(Math.abs(answer)).split('').reverse().join('')) * Math.sign(answer);
        if (rev !== answer && String(Math.abs(rev)).length === String(Math.abs(answer)).length) return rev;
      }
      return answer + sign * (Math.abs(answer) >= 200 && rng.chance(0.5) ? 100 : 10);
    }
  }
}

function fracDistractor(
  rng: Rng,
  strategy: DistractorStrategy,
  seq: readonly (Frac | null)[],
  blank: number,
  answer: Frac,
): Frac | null {
  const sign = rng.chance(0.5) ? 1 : -1;
  const part = rng.chance(0.5) ? 'n' : 'd';
  const bump = (k: number) =>
    part === 'n' ? frac(answer.n + sign * k, answer.d) : frac(answer.n, answer.d + sign * k);
  switch (strategy) {
    case 'near':
      return bump(rng.int(1, 3));
    case 'step': {
      const pick = (f: Frac) => (part === 'n' ? f.n : f.d);
      const nums = seq.map((f) => (f === null ? null : pick(f)));
      const gaps = neighborGaps(nums, blank);
      return bump(Math.max(1, gaps.length ? Math.abs(gaps[0]) : 1));
    }
    case 'mistake': {
      const l1 = seq[blank - 1];
      const l2 = seq[blank - 2];
      if (l1 && l2) return frac(2 * l1.n - l2.n, 2 * l1.d - l2.d);
      return bump(rng.int(1, 4));
    }
    case 'digit':
      return bump(rng.chance(0.5) ? 10 : 2);
  }
}
