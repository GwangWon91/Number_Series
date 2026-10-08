import Dexie, { type EntityTable } from 'dexie';
import type { Attempt, Flag, Session } from './types';

/**
 * uploaded: 0 = 아직 내 계정 동기화에 올리지 않음, 1 = 올림 (Dexie 인덱스는 boolean을 지원하지 않아 숫자 사용)
 * pooled: 0 = 아직 익명 풀이 기록(pool)으로 보내지 않음, 1 = 보냄
 */
export type Stored<T> = T & { uploaded: 0 | 1; pooled?: 0 | 1 };

class LocalDb extends Dexie {
  attempts!: EntityTable<Stored<Attempt>, 'id'>;
  flags!: EntityTable<Stored<Flag>, 'id'>;
  sessions!: EntityTable<Stored<Session>, 'id'>;

  constructor() {
    super('skct-number-series');
    this.version(1).stores({
      attempts: 'id, ts, typeId, uploaded',
      flags: 'id, ts, uploaded',
    });
    // v2: 익명 풀이 기록 전송 여부. 기존 기록은 한 번 보내도록 0으로 시작
    this.version(2)
      .stores({
        attempts: 'id, ts, typeId, uploaded, pooled',
        flags: 'id, ts, uploaded, pooled',
      })
      .upgrade(async (tx) => {
        await tx.table('attempts').toCollection().modify({ pooled: 0 });
        await tx.table('flags').toCollection().modify({ pooled: 0 });
      });
    // v3: 세션 기록 (익명 pool로는 보내지 않는다). 기존 기록은 그대로 둔다
    this.version(3).stores({
      attempts: 'id, ts, typeId, uploaded, pooled, sessionId',
      sessions: 'id, ts, uploaded',
    });
  }
}

export const db = new LocalDb();
