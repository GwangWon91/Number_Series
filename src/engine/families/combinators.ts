import {
  allFracs,
  allInts,
  divV,
  eqNum,
  frac,
  isFrac,
  mulV,
  plain,
  rational,
  reducedDen,
  signed,
  toNumber,
  type Frac,
  type Value,
} from '../value';
import { redundancyOf, type Family, type FitResult, type IntRule, type RuleMatch } from './types';

/** 정수 규칙 하나로 빈칸 후보를 만든다: 앞부분의 다음 값 + 뒷부분의 이전 값 */
export function ruleCandidates(
  rule: IntRule,
  seq: readonly (number | null)[],
  blank: number,
): number[] {
  if (rule.candidates) return rule.candidates(seq, blank);
  const prefix = seq.slice(0, blank) as number[];
  const suffix = seq.slice(blank + 1) as number[];
  const out: number[] = [];
  if (prefix.length) out.push(...rule.next(prefix));
  if (suffix.length) out.push(...rule.prev(suffix));
  return out;
}

/** 여러 규칙 중 파라미터가 가장 적은(가장 단순한) 일치 */
export function simplestMatch(
  rules: readonly IntRule[],
  seq: readonly number[],
  fmt: (n: number) => string = plain,
): { rule: IntRule; match: RuleMatch } | null {
  let best: { rule: IntRule; match: RuleMatch } | null = null;
  for (const rule of rules) {
    if (seq.length < rule.minLength) continue;
    const match = rule.match(seq, fmt);
    if (match && (!best || match.params < best.match.params)) best = { rule, match };
  }
  return best;
}

/** 정수 규칙을 solver가 쓰는 Family로 감싼다 */
export function familyFromRule(rule: IntRule): Family {
  return {
    id: rule.id,
    label: rule.label,
    fit(seq, blank) {
      if (!allInts(seq) || seq.length < rule.minLength) return null;
      const m = rule.match(seq, plain);
      if (!m) return null;
      return {
        redundancy: redundancyOf(seq.length, m.params, blank),
        explain: m.explain ?? [`${rule.label} — ${m.summary}`],
      };
    },
    candidates(seq, blank) {
      if (!seq.every((v, i) => i === blank || typeof v === 'number')) return [];
      return ruleCandidates(rule, seq as (number | null)[], blank);
    },
  };
}

// ───────────────────────── 계차 (차이에 규칙 적용) ─────────────────────────

export const diffs = (s: readonly number[]) => s.slice(1).map((v, i) => v - s[i]);

function diffRows(s: readonly number[], level: number): number[][] {
  const rows = [s.slice()];
  for (let l = 1; l <= level; l++) rows.push(diffs(rows[l - 1]));
  return rows;
}

const LEVEL_NAMES = ['차이', '차이의 차이', '3단계 차이'];

/**
 * level단계 차이 수열이 base 규칙을 따르는 규칙.
 * 예: diffOf(arithmeticRule, 1) = "계차가 등차", diffOf(geometricRule, 1) = "계차가 등비"
 */
export function diffOf(base: IntRule, level: number, id: string, label: string): IntRule {
  const name = LEVEL_NAMES[level - 1];
  return {
    id,
    label,
    minLength: base.minLength + level,
    match(seq) {
      if (seq.length < base.minLength + level) return null;
      const rows = diffRows(seq, level);
      const m = base.match(rows[level], signed);
      if (!m) return null;
      return {
        params: level + m.params,
        summary: `${name}가 ${m.summary}`,
        explain: [
          label,
          ...rows.slice(1).map((r, i) => `${LEVEL_NAMES[i]}: ${r.map(signed).join('  ')}`),
          `→ ${name}가 ${m.summary}`,
        ],
      };
    },
    next(seq) {
      if (seq.length <= level) return [];
      const rows = diffRows(seq, level);
      return base.next(rows[level]).map((b) => {
        let v = b;
        for (let l = level - 1; l >= 0; l--) v = rows[l][rows[l].length - 1] + v;
        return v;
      });
    },
    prev(seq) {
      if (seq.length <= level) return [];
      const rows = diffRows(seq, level);
      return base.prev(rows[level]).map((b) => {
        let v = b;
        for (let l = level - 1; l >= 0; l--) v = rows[l][0] - v;
        return v;
      });
    },
  };
}

// ───────────────────────── 홀짝 교대 ─────────────────────────

/** 홀수 번째 항과 짝수 번째 항이 각자 다른 규칙을 따르는 수열 */
export function interleavedFamily(subRules: readonly IntRule[]): Family {
  const split = <T>(seq: readonly T[]) => [0, 1].map((p) => seq.filter((_, i) => i % 2 === p));
  return {
    id: 'interleaved',
    label: '홀짝 교대 수열',
    fit(seq, blank) {
      if (!allInts(seq) || seq.length < 6) return null;
      const subs = split(seq);
      const found = subs.map((s) => simplestMatch(subRules, s));
      if (!found[0] || !found[1]) return null;
      if (found[0].rule.id === 'constant' && found[1].rule.id === 'constant') return null;
      const redundancy = Math.min(
        ...found.map((f, p) =>
          redundancyOf(subs[p].length, f!.match.params, blank !== null && blank % 2 === p ? 0 : null),
        ),
      );
      return {
        redundancy,
        explain: [
          '홀수 번째 항과 짝수 번째 항이 각각 다른 규칙',
          `홀수 번째: ${subs[0].map(plain).join(', ')} → ${found[0].match.summary}`,
          `짝수 번째: ${subs[1].map(plain).join(', ')} → ${found[1].match.summary}`,
        ],
      };
    },
    candidates(seq, blank) {
      if (!seq.every((v, i) => i === blank || typeof v === 'number')) return [];
      const sub = split(seq)[blank % 2] as (number | null)[];
      const subBlank = Math.floor(blank / 2);
      return subRules.flatMap((r) => ruleCandidates(r, sub, subBlank));
    },
  };
}

// ───────────────────────── 군수열 ─────────────────────────

export type GroupOp = 'add' | 'sub' | 'mul' | 'div';

const div = (a: number, b: number) => (b !== 0 && a % b === 0 ? a / b : null);

/** (a, b, c) 묶음에서 c = a ○ b. solveA/solveB는 빈칸이 a/b 자리일 때의 역산 */
export const GROUP_OPS: Record<
  GroupOp,
  {
    symbol: string;
    apply(a: number, b: number): number | null;
    solveA(b: number, c: number): number | null;
    solveB(a: number, c: number): number | null;
  }
> = {
  add: { symbol: '+', apply: (a, b) => a + b, solveA: (b, c) => c - b, solveB: (a, c) => c - a },
  sub: { symbol: '−', apply: (a, b) => a - b, solveA: (b, c) => c + b, solveB: (a, c) => a - c },
  mul: { symbol: '×', apply: (a, b) => a * b, solveA: (b, c) => div(c, b), solveB: (a, c) => div(c, a) },
  div: { symbol: '÷', apply: (a, b) => div(a, b), solveA: (b, c) => b * c, solveB: (a, c) => div(a, c) },
};

const GROUP_SIZE = 3;

/** 3개씩 묶었을 때 각 묶음에서 (첫째 ○ 둘째 = 셋째)가 성립하는 수열 */
export const groupedFamily: Family = {
  id: 'grouped',
  label: '군수열',
  fit(seq, blank) {
    if (!allInts(seq) || seq.length % GROUP_SIZE !== 0) return null;
    const groups = seq.length / GROUP_SIZE;
    if (groups < 3) return null;
    for (const op of Object.values(GROUP_OPS)) {
      const triples = Array.from({ length: groups }, (_, g) => seq.slice(g * 3, g * 3 + 3));
      if (!triples.every(([a, b, c]) => op.apply(a, b) === c)) continue;
      return {
        // 묶음마다 a, b 두 개가 자유 + 연산 1개
        redundancy: redundancyOf(seq.length, groups * 2 + 1, blank),
        explain: [
          `${GROUP_SIZE}개씩 묶으면 각 묶음에서 (첫째 ${op.symbol} 둘째 = 셋째)`,
          triples
            .map(([a, b, c]) => `(${plain(a)} ${op.symbol} ${plain(b)} = ${plain(c)})`)
            .join('  '),
        ],
      };
    }
    return null;
  },
  candidates(seq, blank) {
    if (seq.length % GROUP_SIZE !== 0) return [];
    if (!seq.every((v, i) => i === blank || typeof v === 'number')) return [];
    const g = Math.floor(blank / GROUP_SIZE) * GROUP_SIZE;
    const [a, b, c] = seq.slice(g, g + 3) as (number | null)[];
    const pos = blank % GROUP_SIZE;
    const out: number[] = [];
    for (const op of Object.values(GROUP_OPS)) {
      const v =
        pos === 2 ? op.apply(a!, b!) : pos === 0 ? op.solveA(b!, c!) : op.solveB(a!, c!);
      if (v !== null) out.push(v);
    }
    return out;
  },
};

// ───────────────────────── 분수 ─────────────────────────

/** 분자와 분모가 각각 정수 규칙을 따르는 분수 수열 */
export function fractionFamily(subRules: readonly IntRule[]): Family {
  const parts = (seq: readonly Frac[]) => [seq.map((f) => f.n), seq.map((f) => f.d)];
  return {
    id: 'fraction',
    label: '분수 수열',
    fit(seq, blank) {
      // 소수 표기(0.4 = 4/10)의 분자·분모는 화면에 안 보이므로 제외
      if (seq.length < 4 || !allFracs(seq) || seq.some((f) => f.fmt === 'dec')) return null;
      const [nums, dens] = parts(seq);
      const fn = simplestMatch(subRules, nums);
      const fd = simplestMatch(subRules, dens);
      if (!fn || !fd) return null;
      if (fn.rule.id === 'constant' && fd.rule.id === 'constant') return null;
      return {
        redundancy: Math.min(
          redundancyOf(seq.length, fn.match.params, blank),
          redundancyOf(seq.length, fd.match.params, blank),
        ),
        explain: [
          '분자와 분모가 각각 규칙을 따름',
          `분자: ${nums.map(plain).join(', ')} → ${fn.match.summary}`,
          `분모: ${dens.map(plain).join(', ')} → ${fd.match.summary}`,
        ],
      };
    },
    candidates(seq, blank) {
      if (!seq.every((v, i) => i === blank || (v !== null && isFrac(v) && v.fmt !== 'dec'))) return [];
      const known = seq as (Frac | null)[];
      const comp = (pick: (f: Frac) => number) => {
        const sub = known.map((f) => (f === null ? null : pick(f)));
        return [...new Set(subRules.flatMap((r) => ruleCandidates(r, sub, blank)))];
      };
      const ns = comp((f) => f.n);
      const ds = comp((f) => f.d).filter((d) => d !== 0);
      const out: Value[] = [];
      for (const n of ns) for (const d of ds) out.push(frac(n, d));
      return out;
    },
  };
}

// ───────────────────────── 유리수 (통분 후 정수 규칙) ─────────────────────────

const MAX_LCD = 1000;
const gcdInt = (x: number, y: number): number => (y === 0 ? x : gcdInt(y, x % y));
const lcm = (a: number, b: number) => (a / gcdInt(a, b)) * b;

/** 약분한 분모들의 최소공배수 (너무 크면 null) */
function commonDen(values: readonly Value[]): number | null {
  let L = 1;
  for (const v of values) {
    L = lcm(L, reducedDen(v));
    if (L > MAX_LCD) return null;
  }
  return L;
}

const scaleTo = (v: Value, L: number) => Math.round(toNumber(v) * L);

/**
 * 분수·소수·대분수가 섞인 수열을 공통분모 L로 통분(×L)해 정수 계열로 판정한다.
 * 예: 1/3, 1/2, 5/6, 4/3, 2 → ×6 → 2, 3, 5, 8, 12 (계차) / 0.4, 0.9, 1.3 → ×10 → 4, 9, 13 (피보나치)
 * bases는 배율을 바꿔도 성립이 유지되는 정수 계열만 (등차·계차·합·홀짝·군수열 합 등).
 */
export function rationalFamily(bases: readonly Family[]): Family {
  return {
    id: 'rational',
    label: '유리수 수열 (통분)',
    fit(seq, blank) {
      if (allInts(seq)) return null;
      const L = commonDen(seq);
      if (!L) return null;
      const scaled = seq.map((v) => scaleTo(v, L));
      let best: FitResult | null = null;
      for (const f of bases) {
        const r = f.fit(scaled, blank);
        if (r && (!best || r.redundancy > best.redundancy)) best = r;
      }
      if (!best) return null;
      return {
        redundancy: best.redundancy,
        explain: [`모두 ${L}배 하면(통분) ${scaled.map(plain).join(', ')}`, ...best.explain],
      };
    },
    candidates(seq, blank) {
      const known = seq.filter((v): v is Value => v !== null);
      if (allInts(known)) return [];
      const L = commonDen(known);
      if (!L) return [];
      const scaled = seq.map((v) => (v === null ? null : scaleTo(v, L)));
      return bases
        .flatMap((f) => f.candidates(scaled, blank))
        .filter((c): c is number => typeof c === 'number')
        .map((c) => rational(c, L));
    },
  };
}

const ratioText = (r: Value) => (isFrac(r) ? `×${plain(r.n)}/${r.d}` : `×${plain(r)}`);

/** 공비가 분수인 등비수열 (×3/2, ×2/3, ×1.5). 공비가 정수(또는 ÷정수)인 정수열은 geometric이 맡는다. */
export const rationalGeometricFamily: Family = {
  id: 'rational-geometric',
  label: '등비수열 (분수 공비)',
  fit(seq, blank) {
    if (seq.length < 3) return null;
    const r = divV(seq[1], seq[0]);
    if (r === null || eqNum(r, 0) || eqNum(r, 1)) return null;
    if (allInts(seq) && (!isFrac(r) || Math.abs(r.n) === 1)) return null;
    for (let i = 1; i < seq.length; i++) if (!eqNum(mulV(seq[i - 1], r), seq[i])) return null;
    return { redundancy: redundancyOf(seq.length, 2, blank), explain: [`등비수열 — ${ratioText(r)}씩`] };
  },
  candidates(seq, blank) {
    const at = (i: number) => (i >= 0 && i < seq.length ? seq[i] : null);
    const [p2, p1, n1, n2] = [at(blank - 2), at(blank - 1), at(blank + 1), at(blank + 2)];
    const out: Value[] = [];
    if (p2 !== null && p1 !== null) {
      const r = divV(p1, p2);
      if (r !== null) out.push(mulV(p1, r));
    }
    if (n1 !== null && n2 !== null) {
      const r = divV(n2, n1);
      const v = r === null ? null : divV(n1, r);
      if (v !== null) out.push(v);
    }
    return out;
  },
};
