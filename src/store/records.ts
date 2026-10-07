import { db, type Stored } from './db';
import type { Attempt, ExportFile, Flag } from './types';

/**
 * 기록 저장소. 기기 안(IndexedDB)이 항상 원본이고, 클라우드 동기화는 이 위에 얹힌다.
 * 쓰기가 생기면 listeners(동기화 모듈)에 알린다.
 */

type Listener = () => void;
const listeners = new Set<Listener>();
export function onLocalWrite(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const notify = () => listeners.forEach((fn) => fn());

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function addAttempt(a: Attempt): Promise<void> {
  await db.attempts.put({ ...a, uploaded: 0 });
  notify();
}

export async function addFlag(f: Flag): Promise<void> {
  await db.flags.put({ ...f, uploaded: 0 });
  notify();
}

export async function todayStats(): Promise<{ solved: number; correct: number }> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const rows = await db.attempts.where('ts').aboveOrEqual(start.getTime()).toArray();
  return { solved: rows.length, correct: rows.filter((r) => r.correct).length };
}

export async function counts(): Promise<{ attempts: number; flags: number }> {
  return { attempts: await db.attempts.count(), flags: await db.flags.count() };
}

const strip = <T extends object>({ uploaded: _u, ...rest }: Stored<T>) => rest as unknown as T;

export async function exportAll(): Promise<ExportFile> {
  return {
    app: 'skct-number-series',
    format: 1,
    exportedAt: new Date().toISOString(),
    attempts: (await db.attempts.orderBy('ts').toArray()).map(strip<Attempt>),
    flags: (await db.flags.orderBy('ts').toArray()).map(strip<Flag>),
  };
}

/** 가져오기: id 기준 병합 (이미 있는 기록은 건너뜀). 가져온 기록은 업로드 대상으로 표시한다. */
export async function importAll(file: ExportFile): Promise<{ attempts: number; flags: number }> {
  if (file.app !== 'skct-number-series') throw new Error('이 앱에서 내보낸 파일이 아닙니다');
  const added = { attempts: 0, flags: 0 };
  await db.transaction('rw', db.attempts, db.flags, async () => {
    for (const a of file.attempts ?? []) {
      if (!(await db.attempts.get(a.id))) {
        await db.attempts.put({ ...a, uploaded: 0 });
        added.attempts++;
      }
    }
    for (const f of file.flags ?? []) {
      if (!(await db.flags.get(f.id))) {
        await db.flags.put({ ...f, uploaded: 0 });
        added.flags++;
      }
    }
  });
  if (added.attempts || added.flags) notify();
  return added;
}

/** 동기화 모듈용: 다른 기기에서 받은 기록 저장 (이미 업로드된 것으로 표시) */
export async function mergeRemote(attempts: Attempt[], flags: Flag[]): Promise<void> {
  await db.transaction('rw', db.attempts, db.flags, async () => {
    if (attempts.length) await db.attempts.bulkPut(attempts.map((a) => ({ ...a, uploaded: 1 as const })));
    if (flags.length) await db.flags.bulkPut(flags.map((f) => ({ ...f, uploaded: 1 as const })));
  });
}

export async function pendingUploads(): Promise<{ attempts: Attempt[]; flags: Flag[] }> {
  return {
    attempts: (await db.attempts.where('uploaded').equals(0).toArray()).map(strip<Attempt>),
    flags: (await db.flags.where('uploaded').equals(0).toArray()).map(strip<Flag>),
  };
}

export async function markUploaded(kind: 'attempts' | 'flags', ids: string[]): Promise<void> {
  const table = kind === 'attempts' ? db.attempts : db.flags;
  await table.bulkUpdate(ids.map((key) => ({ key, changes: { uploaded: 1 as const } })));
}
