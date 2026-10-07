import { FAMILIES, type Family } from './families';
import type { Analysis, Explanation } from './solver';
import { analyze } from './solver';
import { addV, divV, formatValue, mulV, numKey, subV, uniqueValues, type Value } from './value';

/**
 * 묻는 방식. 없으면 빈칸 1개(기본).
 *  - pair: 빈칸 A·B 두 개, 정답은 A ○ B 값 (terms의 두 null 위치가 blanks)
 *  - nth : 앞의 몇 항만 보여 주고 n번째(1부터) 항을 묻는다 (terms에 null 없음)
 */
export type PairOp = '+' | '−' | '×' | '/';
export type Question =
  | { kind: 'pair'; op: PairOp; blanks: [number, number]; values?: [Value, Value] }
  | { kind: 'nth'; n: number };

export const PAIR_OPS: readonly PairOp[] = ['+', '−', '×', '/'];

export function applyPairOp(op: PairOp, a: Value, b: Value): Value | null {
  if (op === '+') return addV(a, b);
  if (op === '−') return subV(a, b);
  if (op === '×') return mulV(a, b);
  return divV(a, b);
}

/** 화면 문구: "빈칸에 들어갈 수", "A × B의 값", "7번째 수" */
export function questionText(q: Question | undefined): string {
  if (!q) return '빈칸에 들어갈 수로 알맞은 것은?';
  if (q.kind === 'pair') return `A ${q.op} B의 값으로 알맞은 것은?`;
  return `${q.n}번째 수로 알맞은 것은?`;
}

/** 한 칸의 후보: 앞에 이어지는 항이 2개 이상이면 앞부분으로, 아니면 뒷부분으로 예측 */
function blankCandidates(seq: readonly (Value | null)[], at: number, families: readonly Family[]): Value[] {
  const before: Value[] = [];
  for (let i = at - 1; i >= 0 && seq[i] !== null; i--) before.unshift(seq[i] as Value);
  if (before.length >= 2) return uniqueValues(families.flatMap((f) => f.candidates([...before, null], before.length)));
  const after: Value[] = [];
  for (let i = at + 1; i < seq.length && seq[i] !== null; i++) after.push(seq[i] as Value);
  return uniqueValues(families.flatMap((f) => f.candidates([null, ...after], 0)));
}

/**
 * pair: A 후보(앞쪽 칸) → 그 값을 채운 상태에서 B 후보 → (A, B) 쌍마다 모든 계열로 완성 수열을 검증.
 * 여유 항은 빈칸 2개만큼 뺀다. extraPairs: 생성기가 아는 정답 (A, B).
 */
function analyzePair(
  seq: readonly (Value | null)[],
  q: Extract<Question, { kind: 'pair' }>,
  extraPairs: readonly [Value, Value][],
  families: readonly Family[],
): Analysis {
  const [ia, ib] = q.blanks;
  const pairs = new Map<string, [Value, Value]>();
  for (const p of extraPairs) pairs.set(`${numKey(p[0])}|${numKey(p[1])}`, p);
  for (const a of blankCandidates(seq, ia, families)) {
    const withA = seq.slice();
    withA[ia] = a;
    for (const b of blankCandidates(withA, ib, families)) pairs.set(`${numKey(a)}|${numKey(b)}`, [a, b]);
  }
  const explanations: Explanation[] = [];
  for (const [a, b] of pairs.values()) {
    const value = applyPairOp(q.op, a, b);
    if (value === null) continue;
    const filled = seq.slice() as Value[];
    filled[ia] = a;
    filled[ib] = b;
    for (const f of families) {
      const r = f.fit(filled, null);
      if (!r) continue;
      explanations.push({
        familyId: f.id,
        value,
        redundancy: r.redundancy - 2,
        explain: [...r.explain, `A = ${formatValue(a)}, B = ${formatValue(b)} → A ${q.op} B = ${formatValue(value)}`],
        pair: [a, b],
      });
    }
  }
  return { blank: ia, explanations };
}

/** nth: 보이는 항에 맞는 계열마다 한 항씩 n번째까지 이어 붙여 값을 구한다. 계열마다 값이 갈리면 모호. */
function analyzeNth(seq: readonly Value[], n: number, families: readonly Family[]): Analysis {
  const explanations: Explanation[] = [];
  for (const f of families) {
    const shownFit = f.fit(seq, null);
    if (!shownFit) continue;
    const ext = seq.slice();
    while (ext.length < n) {
      const next = f.candidates([...ext, null], ext.length).find((c) => f.fit([...ext, c], null));
      if (next === undefined) break;
      ext.push(next);
    }
    if (ext.length < n) continue;
    explanations.push({
      familyId: f.id,
      value: ext[n - 1],
      redundancy: shownFit.redundancy,
      explain: [...shownFit.explain, `이어 쓰면 ${ext.slice(seq.length).map(formatValue).join(', ')} → ${n}번째 ${formatValue(ext[n - 1])}`],
    });
  }
  return { blank: n - 1, explanations };
}

/** 묻는 방식에 맞춰 해석을 모은다. 해석의 value는 "묻는 값"(빈칸 값, A○B, n번째 항). */
export function analyzeQuestion(
  seq: readonly (Value | null)[],
  q: Question | undefined,
  extra: { values?: readonly Value[]; pairs?: readonly [Value, Value][] } = {},
  families: readonly Family[] = FAMILIES,
): Analysis {
  if (!q) return analyze(seq, extra.values ?? [], families);
  if (q.kind === 'pair') return analyzePair(seq, q, extra.pairs ?? [], families);
  return analyzeNth(seq as Value[], q.n, families);
}
