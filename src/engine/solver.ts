import { FAMILIES, type Family } from './families';
import { eqValue, uniqueValues, type Value } from './value';

/** 빈칸 값 하나에 대한 하나의 해석 */
export interface Explanation {
  familyId: string;
  value: Value;
  redundancy: number;
  explain: string[];
}

export interface Analysis {
  blank: number;
  explanations: Explanation[];
}

/**
 * 빈칸 1개짜리 수열을 등록된 모든 규칙 계열로 해석한다.
 * 1) 각 계열이 빈칸 후보를 제안하고 (+ extra: 정답·오답 선택지)
 * 2) 후보마다 모든 계열로 완성 수열을 검증해 성립하는 해석을 모은다.
 */
export function analyze(
  seq: readonly (Value | null)[],
  extra: readonly Value[] = [],
  families: readonly Family[] = FAMILIES,
): Analysis {
  const blank = seq.indexOf(null);
  if (blank < 0 || seq.indexOf(null, blank + 1) >= 0) {
    throw new Error('빈칸은 정확히 1개여야 합니다');
  }
  const candidates = uniqueValues([...extra, ...families.flatMap((f) => f.candidates(seq, blank))]);
  const explanations: Explanation[] = [];
  const filled = seq.slice() as Value[];
  for (const value of candidates) {
    filled[blank] = value;
    for (const f of families) {
      const r = f.fit(filled, blank);
      if (r) explanations.push({ familyId: f.id, value, ...r });
    }
  }
  return { blank, explanations };
}

export interface Verdict {
  /** 정답을 설명하는 해석 중 여유 항이 충분한 것 */
  supporting: Explanation[];
  /** 정답이 아닌 값을 설명하는, 무시할 수 없는 해석 */
  alternatives: Explanation[];
}

/**
 * @param minRedundancy 정답 해석이 갖춰야 할 최소 여유 항
 * @param altMinRedundancy 이 이상이면 "다른 정답 후보"로 인정 (보수적으로 낮게 둔다)
 */
export function judge(
  analysis: Analysis,
  answer: Value,
  minRedundancy: number,
  altMinRedundancy: number,
): Verdict {
  return {
    supporting: analysis.explanations.filter(
      (e) => eqValue(e.value, answer) && e.redundancy >= minRedundancy,
    ),
    alternatives: analysis.explanations.filter(
      (e) => !eqValue(e.value, answer) && e.redundancy >= altMinRedundancy,
    ),
  };
}
