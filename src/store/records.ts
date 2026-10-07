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

export interface TallyRow {
  key: string;
  solved: number;
  wrong: number;
  /** 평균 풀이 시간(ms) */
  avgMs: number;
}

export interface RecordSummary {
  total: number;
  wrong: number;
  /** 오늘 푼 순서대로 맞았는지 (홈의 "오늘의 수열") */
  today: boolean[];
  /** 오늘(오늘 안 풀었으면 어제)부터 거슬러 연속으로 푼 날 수 */
  streakDays: number;
  /** 유형별, 틀린 비율 높은 순 */
  byType: TallyRow[];
  /** 묻는 방식별: blank / pair / nth */
  byKind: TallyRow[];
}

const dayKey = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

function tally(rows: readonly Attempt[], keyOf: (a: Attempt) => string): TallyRow[] {
  const m = new Map<string, { solved: number; wrong: number; ms: number }>();
  for (const a of rows) {
    const t = m.get(keyOf(a)) ?? { solved: 0, wrong: 0, ms: 0 };
    t.solved++;
    if (!a.correct) t.wrong++;
    t.ms += a.elapsedMs;
    m.set(keyOf(a), t);
  }
  return [...m.entries()]
    .map(([key, t]) => ({ key, solved: t.solved, wrong: t.wrong, avgMs: t.ms / t.solved }))
    .sort((x, y) => y.wrong / y.solved - x.wrong / x.solved || y.solved - x.solved);
}

/** 기록 화면·홈용 집계. 기록은 개인 단위라 전부 읽어 메모리에서 센다 (수천 건 수준). */
export async function recordSummary(): Promise<RecordSummary> {
  const rows = await db.attempts.orderBy('ts').toArray();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const days = new Set(rows.map((r) => dayKey(r.ts)));
  let streakDays = 0;
  const d = new Date();
  if (!days.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d.getTime()))) {
    streakDays++;
    d.setDate(d.getDate() - 1);
  }
  return {
    total: rows.length,
    wrong: rows.filter((r) => !r.correct).length,
    today: rows.filter((r) => r.ts >= start.getTime()).map((r) => r.correct),
    streakDays,
    byType: tally(rows, (a) => a.typeId),
    byKind: tally(rows, (a) => a.question?.kind ?? 'blank'),
  };
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
