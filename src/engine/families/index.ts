import {
  diffOf,
  familyFromRule,
  fractionFamily,
  groupedFamily,
  interleavedFamily,
  rationalFamily,
  rationalGeometricFamily,
  ratioProgressionFamily,
} from './combinators';
import {
  affineRule,
  alternatingOpsRule,
  altSquaresRule,
  opCycleRule,
  arithmeticRule,
  constantRule,
  cycleRule,
  fibProductRule,
  fibSumConstRule,
  fibSumRule,
  geometricRule,
  powerRule,
  tribonacciRule,
} from './rules';
import type { Family } from './types';

export type { Family, FitResult, IntRule } from './types';

const diffArithmetic = diffOf(arithmeticRule, 1, 'diff-arithmetic', '계차수열 (차이가 등차)');
const diffGeometric = diffOf(geometricRule, 1, 'diff-geometric', '계차수열 (차이가 등비)');

/** 홀짝·분수 수열의 부분 수열에 쓰는 단순 규칙 */
const SUB_RULES = [constantRule, arithmeticRule, geometricRule, diffArithmetic, affineRule, fibSumRule];
const FRACTION_SUB_RULES = [constantRule, arithmeticRule, geometricRule, diffArithmetic, fibSumRule, affineRule];

/** 배율(×L)을 바꾸면 성립 여부가 달라지는 계열 — 유리수 통분 판정에서 제외 */
const SCALE_VARIANT = new Set(['power', 'fib-product', 'fraction', 'diff-alt-square']);

/**
 * solver가 경쟁시키는 모든 규칙 계열.
 * 여기 등록된 규칙은 출제 여부(config의 enabled)와 무관하게 "다른 해석" 판정에 쓰인다.
 * 새 규칙 계열을 추가하면 기존 유형 문항의 모호성 검사도 자동으로 강화된다.
 */
const BASE_FAMILIES: readonly Family[] = [
  familyFromRule(arithmeticRule),
  familyFromRule(geometricRule),
  familyFromRule(diffArithmetic),
  familyFromRule(diffOf(arithmeticRule, 2, 'diff-second-arithmetic', '2단계 계차 (차이의 차이가 등차)')),
  familyFromRule(diffGeometric),
  familyFromRule(diffOf(geometricRule, 2, 'diff-second-geometric', '2단계 계차 (차이의 차이가 등비)')),
  familyFromRule(diffOf(cycleRule(2), 1, 'diff-cycle-2', '차이가 주기적으로 반복')),
  familyFromRule(diffOf(cycleRule(3), 1, 'diff-cycle-3', '차이가 주기적으로 반복')),
  familyFromRule(affineRule),
  familyFromRule(alternatingOpsRule),
  familyFromRule(opCycleRule(3)),
  familyFromRule(opCycleRule(4)),
  familyFromRule(diffOf(altSquaresRule, 1, 'diff-alt-square', '차이가 ±제곱수로 번갈아')),
  familyFromRule(powerRule),
  familyFromRule(fibSumRule),
  familyFromRule(fibSumConstRule),
  familyFromRule(tribonacciRule),
  familyFromRule(fibProductRule),
  interleavedFamily(SUB_RULES),
  groupedFamily,
  fractionFamily(FRACTION_SUB_RULES),
];

export const FAMILIES: readonly Family[] = [
  ...BASE_FAMILIES,
  rationalFamily(BASE_FAMILIES.filter((f) => !SCALE_VARIANT.has(f.id))),
  rationalGeometricFamily,
  ratioProgressionFamily,
];

const BY_ID = new Map(FAMILIES.map((f) => [f.id, f]));

export function getFamily(id: string): Family {
  const f = BY_ID.get(id);
  if (!f) throw new Error(`등록되지 않은 규칙 계열: ${id}`);
  return f;
}

export function hasFamily(id: string): boolean {
  return BY_ID.has(id);
}
