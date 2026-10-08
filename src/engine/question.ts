import { FAMILIES, type Family } from './families';
import type { Analysis, Explanation } from './solver';
import { analyze } from './solver';
import { addV, divV, eqNum, formatValue, isFrac, mulV, subV, toNumber, uniqueValues, valueKey, withNotation, type Value } from './value';

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
  // 표기 기준 키: 6/32와 3/16은 값이 같아도 분자·분모 규칙에서는 다른 후보다
  const key = (a: Value, b: Value) => `${valueKey(a)}|${valueKey(b)}`;
  const pairs = new Map<string, [Value, Value]>();
  for (const p of extraPairs) pairs.set(key(...p), p);
  for (const a of blankCandidates(seq, ia, families)) {
    const withA = seq.slice();
    withA[ia] = a;
    for (const b of blankCandidates(withA, ib, families)) if (!pairs.has(key(a, b))) pairs.set(key(a, b), [a, b]);
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
    let redundancy = shownFit.redundancy;
    while (ext.length < n) {
      // 같은 규칙으로 이어 쓰면 여유 항이 줄지 않는다. 줄면 다른(더 복잡한) 규칙으로 맞춘 값이라 버린다
      let fit = -Infinity;
      const next = f.candidates([...ext, null], ext.length).find((c) => {
        fit = f.fit([...ext, c], null)?.redundancy ?? -Infinity;
        return fit >= redundancy;
      });
      if (next === undefined) break;
      ext.push(next);
      redundancy = fit;
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

/**
 * 해설 첫 줄 요약: 차이나 비율이 일정한 증가·감소 수열만 ("매번 +3", "매번 ×2", "차이가 매번 +2", "차이가 매번 ×2"). 그 밖은 null.
 * 정답까지 채운 수열에서 유리수로 정확히 계산한다 (문항 생성과 무관 — 화면 표시용).
 */
export function ruleSummary(item: {
  terms: readonly (Value | null)[];
  answer: Value;
  question?: Question;
}): string | null {
  const q = item.question;
  const filled = !q
    ? item.terms.map((t) => (t === null ? item.answer : t))
    : q.kind === 'pair'
      ? q.values
        ? item.terms.map((t, i) => (t === null ? q.values![q.blanks.indexOf(i)] : t))
        : null
      : item.terms;
  if (!filled || filled.length < 4 || filled.some((v) => v === null)) return null;
  const v = filled as Value[];
  // 소수로 쓴 수열이면 요약도 소수로 (0.5씩 → "+0.5")
  const dec = v.some((x) => isFrac(x) && x.fmt === 'dec');
  const show = (x: Value) => formatValue(dec ? withNotation(x, 'dec') : x);
  const signed = (x: Value) => (toNumber(x) >= 0 ? `+${show(x)}` : show(x));
  const same = (xs: readonly Value[]) => xs.every((x) => eqNum(x, xs[0]));

  const d = v.slice(1).map((x, i) => subV(x, v[i]));
  if (same(d)) return toNumber(d[0]) !== 0 ? `매번 ${signed(d[0])}` : null;
  if (v.every((x) => toNumber(x) !== 0)) {
    const r = v.slice(1).map((x, i) => divV(x, v[i])!);
    const k = toNumber(r[0]);
    if (same(r) && k !== 1) {
      const inv = 1 / k;
      if (k > 0 && k < 1 && Number.isInteger(inv)) return `매번 ÷${inv}`;
      return k < 0 ? `매번 ×(${formatValue(r[0])})` : `매번 ×${formatValue(r[0])}`;
    }
  }
  const dd = d.slice(1).map((x, i) => subV(x, d[i]));
  if (same(dd) && toNumber(dd[0]) !== 0) return `차이가 매번 ${signed(dd[0])}`;
  // 차이가 일정한 배수로 커지는 계차 (3, 6, 12, 24 …)
  if (d.every((x) => toNumber(x) !== 0)) {
    const rd = d.slice(1).map((x, i) => divV(x, d[i])!);
    if (same(rd) && toNumber(rd[0]) > 1 && Number.isInteger(toNumber(rd[0]))) return `차이가 매번 ×${formatValue(rd[0])}`;
  }
  return null;
}
