import { generateItem } from './compose';
import type { EngineConfig } from './config';
import { itemKey, type Item } from './item';
import { randomSeed, Rng } from './rng';

export interface PickOptions {
  /** null이면 전체 유형 무작위 */
  typeId: string | null;
  /** 최근에 낸 문항 키 (itemKey) — 다시 내지 않는다 */
  recentKeys: ReadonlySet<string>;
  seed?: number;
}

/**
 * 연속 풀이의 다음 문항을 고른다.
 * bankRatio 확률로 문제은행(public)에서, 나머지는 자동 생성으로 낸다.
 */
export function pickNextItem(config: EngineConfig, bank: readonly Item[], opts: PickOptions): Item {
  const rng = new Rng(opts.seed ?? randomSeed());
  const pool = bank.filter(
    (it) => (opts.typeId === null || it.typeId === opts.typeId) && !opts.recentKeys.has(itemKey(it)),
  );
  if (pool.length && rng.chance(config.exam.bankRatio)) return rng.pick(pool);

  for (let i = 0; i < 20; i++) {
    const seed = Math.floor(rng.next() * 2 ** 32);
    const item = generateItem(config, { seed, typeId: opts.typeId ?? undefined }).item;
    if (item && !opts.recentKeys.has(itemKey(item))) return item;
  }
  // 최근 문항 회피에 실패해도 풀이는 멈추지 않는다
  for (let i = 0; i < 20; i++) {
    const item = generateItem(config, { seed: randomSeed(), typeId: opts.typeId ?? undefined }).item;
    if (item) return item;
  }
  throw new Error('문항을 생성하지 못했습니다. npm run validate로 설정을 점검하세요.');
}
