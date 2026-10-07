import type { Value } from '../value';

/**
 * "규칙 계열(Family)" — 수열이 어떤 규칙으로 설명되는지 판정하는 단위.
 * 생성기(plugin)는 의도한 Family를 지정하고, solver는 등록된 모든 Family를 경쟁시켜
 * 다른 규칙으로도 설명되는 모호한 문항을 걸러낸다.
 */
export interface FitResult {
  /**
   * 여유 항 수 = 확인에 쓰인 항 수 − 자유 파라미터 수 (빈칸이 있으면 추가로 −1).
   * 0이면 "항이 딱 맞춰질 만큼만" 있어 아무 규칙이나 끼워 맞출 수 있는 상태다.
   */
  redundancy: number;
  /** 해설 줄 (정답 공개 후 표시) */
  explain: string[];
}

export interface Family {
  id: string;
  label: string;
  /** 완성된 수열(빈칸 없음)이 이 규칙을 따르는지. blank는 원래 빈칸 위치(여유 항 계산용). */
  fit(seq: readonly Value[], blank: number | null): FitResult | null;
  /** 빈칸 값 후보. solver가 후보마다 fit으로 검증한다. */
  candidates(seq: readonly (Value | null)[], blank: number): Value[];
}

/**
 * 정수 수열 규칙. Family보다 작은 단위로, 차분(diffOf)·홀짝(interleaved)·분수(fraction)
 * 같은 조합 규칙의 재료가 된다.
 */
export interface IntRule {
  id: string;
  label: string;
  /** 판정에 필요한 최소 길이 */
  minLength: number;
  /** 수열 전체가 규칙을 따르면 자유 파라미터 수와 요약을 돌려준다. fmt는 값 표기 방식(차분이면 부호 표기). */
  match(seq: readonly number[], fmt: (n: number) => string): RuleMatch | null;
  /** 주어진 앞부분 다음에 올 값 후보 */
  next(seq: readonly number[]): number[];
  /** 주어진 뒷부분 앞에 올 값 후보 */
  prev(seq: readonly number[]): number[];
  /** next/prev로 후보를 못 내는 규칙(예: 군수열)은 직접 후보를 계산한다 */
  candidates?(seq: readonly (number | null)[], blank: number): number[];
}

export interface RuleMatch {
  params: number;
  /** "2씩 증가", "×3씩" 같은 짧은 요약 (조합 규칙에서 재사용) */
  summary: string;
  /** 단독으로 쓰일 때의 해설. 없으면 `${label}: ${summary}` */
  explain?: string[];
}

export function redundancyOf(length: number, params: number, blank: number | null): number {
  return length - params - (blank === null ? 0 : 1);
}
