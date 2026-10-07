import type { Item } from '../engine/item';
import { toNumber, type Value } from '../engine/value';

/** 생성 문항과 실전(은행) 문항을 같은 잣대로 비교하기 위한 형식 통계 */
export interface FormatStats {
  count: number;
  avgLength: number;
  blankLastRate: number;
  medianMaxAbs: number;
  maxAbs: number;
  negativeRate: number;
  fractionRate: number;
  /** (최대 선택지 − 최소 선택지) / |정답| 의 중앙값 — 선택지가 얼마나 촘촘한지 */
  medianChoiceSpread: number;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function formatStats(items: readonly Item[]): FormatStats {
  const n = items.length || 1;
  const values = (it: Item) => [...it.terms.filter((t): t is Value => t !== null), it.answer];
  const maxAbs = items.map((it) => Math.max(...values(it).map((v) => Math.abs(toNumber(v)))));
  return {
    count: items.length,
    avgLength: items.reduce((s, it) => s + it.terms.length, 0) / n,
    blankLastRate: items.filter((it) => it.blankIndex === it.terms.length - 1).length / n,
    medianMaxAbs: median(maxAbs),
    maxAbs: Math.max(0, ...maxAbs),
    negativeRate: items.filter((it) => values(it).some((v) => toNumber(v) < 0)).length / n,
    fractionRate: items.filter((it) => typeof it.answer === 'object').length / n,
    medianChoiceSpread: median(
      items.map((it) => {
        const c = it.choices.map(toNumber);
        return (Math.max(...c) - Math.min(...c)) / Math.max(1, Math.abs(toNumber(it.answer)));
      }),
    ),
  };
}
