/** 시드 고정 난수(mulberry32). 같은 seed → 같은 문항을 재현하기 위해 Math.random 대신 사용한다. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** [0, 1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min, max] 정수 */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  range([min, max]: readonly [number, number]): number {
    return this.int(min, max);
  }

  /** 0이 아닌 정수를 범위에서 뽑는다. 범위가 0만 포함하면 0을 돌려준다. */
  nonZero(range: readonly [number, number]): number {
    for (let i = 0; i < 20; i++) {
      const v = this.range(range);
      if (v !== 0) return v;
    }
    return 0;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /** 가중치 객체에서 키 하나를 고른다. 가중치 합이 0이면 오류. */
  weighted<K extends string>(weights: Readonly<Partial<Record<K, number>>>): K {
    const entries = Object.entries(weights) as [K, number][];
    const total = entries.reduce((s, [, w]) => s + (w ?? 0), 0);
    if (total <= 0) throw new Error('가중치 합이 0입니다');
    let r = this.next() * total;
    for (const [k, w] of entries) {
      r -= w ?? 0;
      if (r < 0) return k;
    }
    return entries[entries.length - 1][0];
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}
