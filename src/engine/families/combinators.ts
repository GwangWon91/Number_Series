import { allFracs, allInts, frac, isFrac, plain, signed, type Frac, type Value } from '../value';
import { redundancyOf, type Family, type IntRule, type RuleMatch } from './types';

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
      if (seq.length < 4 || !allFracs(seq)) return null;
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
      if (!seq.every((v, i) => i === blank || (v !== null && isFrac(v)))) return [];
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
