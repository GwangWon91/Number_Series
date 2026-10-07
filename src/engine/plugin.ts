import type { z } from 'zod';
import type { Rng } from './rng';
import type { Value } from './value';

export interface GenerateInput<P> {
  rng: Rng;
  /** config의 length 범위에서 뽑은 항 개수 (빈칸 포함). 군수열처럼 맞춰 조정할 수 있다. */
  length: number;
  params: P;
}

export interface Generated {
  /** 빈칸 없는 완성 수열 */
  terms: Value[];
  /** 이 수열을 설명하는 규칙 계열 id (src/engine/families) — 해설과 자기 일관성 검사에 쓴다 */
  family: string;
  /** 군수열 묶음 크기 (표시용) */
  groupSize?: number;
}

/**
 * 유형 생성기. 새 유형 = 이 인터페이스를 구현한 파일 1개 + plugins/index.ts 등록 1줄
 * + config/types/<id>.yaml 1개. 범위 검사·빈칸·선택지·모호성 검사는 compose가 공통으로 처리한다.
 */
export interface TypePlugin<P = unknown> {
  /** config/types/<id>.yaml 의 id와 같아야 한다 */
  id: string;
  /** 난이도별 파라미터 스키마 */
  params: z.ZodType<P>;
  /** 실패(조건 불만족)하면 null — compose가 재시도한다 */
  generate(input: GenerateInput<P>): Generated | null;
}

/** 타입 추론을 돕는 헬퍼 (P를 schema에서 추론) */
export function definePlugin<S extends z.ZodType>(plugin: {
  id: string;
  params: S;
  generate(input: GenerateInput<z.infer<S>>): Generated | null;
}): TypePlugin {
  return plugin as TypePlugin;
}
