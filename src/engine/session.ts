import { generateItem, pickType } from './compose';
import type { Difficulty, EngineConfig } from './config';
import { getType } from './config';
import { itemKey, type Item } from './item';
import { randomSeed, Rng } from './rng';

export interface PickOptions {
  /** null이면 전체 유형 무작위 */
  typeId: string | null;
  /** 최근에 낸 문항 키 (itemKey) — 다시 내지 않는다 */
  recentKeys: ReadonlySet<string>;
  seed?: number;
  /** typeId가 null일 때 유형 가중치 (약점 출제). 없으면 설정 비중 */
  typeWeights?: Readonly<Record<string, number>>;
  /** 유형별 원하는 난이도 단계 (적응형). 없으면 설정의 난이도 비중 */
  levelOf?: (typeId: string) => number;
  /** 문제은행 비율. 없으면 exam.bankRatio */
  bankRatio?: number;
}

/** 유형에 정의된 난이도 중 단계에 가장 가까운 것 (diff-second처럼 1단계가 없는 유형도 있다) */
export function nearestDifficulty(level: number, defined: readonly number[]): Difficulty {
  const below = defined.filter((d) => d <= level);
  return (below.length ? Math.max(...below) : Math.min(...defined)) as Difficulty;
}

/**
 * 연속 풀이의 다음 문항을 고른다.
 * bankRatio 확률로 문제은행(public)에서, 나머지는 자동 생성으로 낸다.
 * 유형·난이도를 직접 정해도 id(gen:유형:난이도:seed)로 그대로 재현된다.
 */
export function pickNextItem(config: EngineConfig, bank: readonly Item[], opts: PickOptions): Item {
  const rng = new Rng(opts.seed ?? randomSeed());
  const allowed = (t: string) => (opts.typeId !== null ? t === opts.typeId : !opts.typeWeights || t in opts.typeWeights);
  const pool = bank.filter((it) => allowed(it.typeId) && !opts.recentKeys.has(itemKey(it)));
  if (pool.length && rng.chance(opts.bankRatio ?? config.exam.bankRatio)) return rng.pick(pool);

  // 유형·난이도를 여기서 정할지 (적응형·약점), generateItem에 맡길지
  const spec = (seed: number) => {
    const typeId = opts.typeId ?? (opts.typeWeights ? rng.weighted(opts.typeWeights) : opts.levelOf ? pickType(config, rng).id : undefined);
    if (!typeId || !opts.levelOf) return { seed, typeId };
    const defined = Object.keys(getType(config, typeId).difficulty).map(Number);
    return { seed, typeId, difficulty: nearestDifficulty(opts.levelOf(typeId), defined) };
  };

  for (let i = 0; i < 20; i++) {
    const item = generateItem(config, spec(Math.floor(rng.next() * 2 ** 32))).item;
    if (item && !opts.recentKeys.has(itemKey(item))) return item;
  }
  // 최근 문항 회피에 실패해도 풀이는 멈추지 않는다
  for (let i = 0; i < 20; i++) {
    const item = generateItem(config, spec(randomSeed())).item;
    if (item) return item;
  }
  throw new Error('문항을 생성하지 못했습니다. npm run validate로 설정을 점검하세요.');
}
