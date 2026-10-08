/**
 * 실력에 맞춘 출제 정책 (순수 함수).
 *  - 유형별 숙련 단계 1~3 = config/types의 난이도. 잘 풀면 올리고 자주 틀리면 내린다 (계단식, 완만하게)
 *  - 약점 가중치: 내 기록에서 틀린 비율이 높은 유형일수록 자주
 */

export const MAX_LEVEL = 3;
/** 승급: 지금 단계에서 최근 6문제 중 5문제 이상 정답 */
const PROMOTE = { window: 6, correct: 5 };
/** 강등: 지금 단계에서 최근 5문제 중 3문제 이상 오답 */
const DEMOTE = { window: 5, wrong: 3 };

export interface TypeSkill {
  level: number;
  /** 지금 단계에서의 최근 정오 (단계가 바뀌면 비운다) */
  recent: boolean[];
}
export type Skills = Record<string, TypeSkill>;

/** 저장값이 깨졌으면 1단계부터 */
export function skillOf(skills: Skills, typeId: string): TypeSkill {
  const s = skills[typeId];
  return s && Number.isInteger(s.level) && Array.isArray(s.recent) ? s : { level: 1, recent: [] };
}

export function updateSkill(s: TypeSkill, correct: boolean): TypeSkill {
  const recent = [...s.recent, correct].slice(-PROMOTE.window);
  const right = recent.filter(Boolean).length;
  if (s.level < MAX_LEVEL && recent.length >= PROMOTE.window && right >= PROMOTE.correct) {
    return { level: s.level + 1, recent: [] };
  }
  const last = recent.slice(-DEMOTE.window);
  if (s.level > 1 && last.length >= DEMOTE.window && last.filter((x) => !x).length >= DEMOTE.wrong) {
    return { level: s.level - 1, recent: [] };
  }
  return { level: s.level, recent };
}

export interface TypeTally {
  key: string;
  solved: number;
  wrong: number;
}

/**
 * 약점 유형 가중치: 3문제 이상 푼 유형 중 오답률 상위 3개. 기록이 부족하면 null.
 * ponytail: 상위 3개 고정. 유형이 많아지면 오답률 임계값 방식으로.
 */
export function weakWeights(byType: readonly TypeTally[], enabled: ReadonlySet<string>): Record<string, number> | null {
  const rated = byType
    .filter((r) => enabled.has(r.key) && r.solved >= 3 && r.wrong > 0)
    .map((r) => ({ key: r.key, rate: r.wrong / r.solved }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 3);
  if (!rated.length) return null;
  return Object.fromEntries(rated.map((r) => [r.key, r.rate]));
}
