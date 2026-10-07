import Dexie, { type EntityTable } from 'dexie';
import type { Attempt, Flag } from './types';

/** uploaded: 0 = 아직 클라우드에 올리지 않음, 1 = 올림 (Dexie 인덱스는 boolean을 지원하지 않아 숫자 사용) */
export type Stored<T> = T & { uploaded: 0 | 1 };

class LocalDb extends Dexie {
  attempts!: EntityTable<Stored<Attempt>, 'id'>;
  flags!: EntityTable<Stored<Flag>, 'id'>;

  constructor() {
    super('skct-number-series');
    this.version(1).stores({
      attempts: 'id, ts, typeId, uploaded',
      flags: 'id, ts, uploaded',
    });
  }
}

export const db = new LocalDb();
