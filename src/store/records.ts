import type { Item } from '../engine/item';
import { db, type Stored } from './db';
import type { Attempt, ExportFile, Flag, Session } from './types';

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

/** 풀이 기록·플래그에 함께 남기는 문항 스냅숏 (설정이 바뀐 뒤에도 그대로 검토할 수 있게) */
export const itemSnapshot = (item: Item) => ({
  itemId: item.id,
  typeId: item.typeId,
  difficulty: item.difficulty,
  seed: item.seed,
  configVersion: item.configVersion,
  terms: item.terms,
  question: item.question,
  answer: item.answer,
  choices: item.choices,
});

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function addAttempt(a: Attempt): Promise<void> {
  await db.attempts.put({ ...a, uploaded: 0, pooled: 0 });
  notify();
}

export async function addFlag(f: Flag): Promise<void> {
  await db.flags.put({ ...f, uploaded: 0, pooled: 0 });
  notify();
}

export async function addSession(s: Session): Promise<void> {
  await db.sessions.put({ ...s, uploaded: 0 });
  notify();
}

/** 성장 지표 계산용 전체 기록 (개인 기록이라 수천 건 수준 — 메모리에서 센다) */
export async function history(): Promise<{ attempts: Attempt[]; sessions: Session[] }> {
  return {
    attempts: (await db.attempts.orderBy('ts').toArray()).map(strip<Attempt>),
    sessions: (await db.sessions.orderBy('ts').toArray()).map(strip<Session>),
  };
}

/** 같은 모드의 이전 세션 최고 점수 (없으면 null) */
export async function bestScore(modeId: string, exceptId: string): Promise<number | null> {
  const scores = (await db.sessions.toArray())
    .filter((s) => s.modeId === modeId && s.id !== exceptId && s.score !== undefined)
    .map((s) => s.score!);
  return scores.length ? Math.max(...scores) : null;
}

/** 모드(Session.modeId)별 최고 점수 — 홈의 모드 카드용 */
export async function bestScores(): Promise<Record<string, number>> {
  const best: Record<string, number> = {};
  for (const s of await db.sessions.toArray()) {
    if (s.score !== undefined && s.score > (best[s.modeId] ?? -1)) best[s.modeId] = s.score;
  }
  return best;
}

/** 동기화되는 기록 종류 (sync.ts가 같은 목록을 돈다) */
export type RecordKind = 'attempts' | 'flags' | 'sessions';
const table = (kind: RecordKind) => db[kind] as unknown as typeof db.attempts;

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
  /** 유형별, 틀린 비율 높은 순 */
  byType: TallyRow[];
  /** 묻는 방식별: blank / pair / nth */
  byKind: TallyRow[];
}

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
  return {
    total: rows.length,
    wrong: rows.filter((r) => !r.correct).length,
    today: rows.filter((r) => r.ts >= start.getTime()).map((r) => r.correct),
    byType: tally(rows, (a) => a.typeId),
    byKind: tally(rows, (a) => a.question?.kind ?? 'blank'),
  };
}

export async function counts(): Promise<{ attempts: number; flags: number }> {
  return { attempts: await db.attempts.count(), flags: await db.flags.count() };
}

const strip = <T extends object>({ uploaded: _u, pooled: _p, ...rest }: Stored<T>) => rest as unknown as T;

export async function exportAll(): Promise<ExportFile> {
  return {
    app: 'skct-number-series',
    format: 2,
    exportedAt: new Date().toISOString(),
    attempts: (await db.attempts.orderBy('ts').toArray()).map(strip<Attempt>),
    flags: (await db.flags.orderBy('ts').toArray()).map(strip<Flag>),
    sessions: (await db.sessions.orderBy('ts').toArray()).map(strip<Session>),
  };
}

/** 가져오기: id 기준 병합 (이미 있는 기록은 건너뜀). 가져온 기록은 업로드 대상으로 표시한다. */
export async function importAll(file: ExportFile): Promise<{ attempts: number; flags: number }> {
  if (file.app !== 'skct-number-series') throw new Error('이 앱에서 내보낸 파일이 아닙니다');
  const added = { attempts: 0, flags: 0 };
  await db.transaction('rw', db.attempts, db.flags, db.sessions, async () => {
    for (const a of file.attempts ?? []) {
      if (!(await db.attempts.get(a.id))) {
        await db.attempts.put({ ...a, uploaded: 0, pooled: 0 });
        added.attempts++;
      }
    }
    for (const f of file.flags ?? []) {
      if (!(await db.flags.get(f.id))) {
        await db.flags.put({ ...f, uploaded: 0, pooled: 0 });
        added.flags++;
      }
    }
    // 세션은 화면에 개수를 보여 주지 않으므로 이미 있는 것만 건너뛴다 (format 1 파일에는 없음)
    for (const s of file.sessions ?? []) {
      if (!(await db.sessions.get(s.id))) await db.sessions.put({ ...s, uploaded: 0 });
    }
  });
  if (added.attempts || added.flags) notify();
  return added;
}

/** 동기화 모듈용: 다른 기기에서 받은 기록 저장 (이미 업로드됨 + 원래 기기가 pool로 보냈으므로 pooled도 1) */
export async function mergeRemote(remote: { attempts: Attempt[]; flags: Flag[]; sessions: Session[] }): Promise<void> {
  const { attempts, flags, sessions } = remote;
  await db.transaction('rw', db.attempts, db.flags, db.sessions, async () => {
    if (attempts.length) await db.attempts.bulkPut(attempts.map((a) => ({ ...a, uploaded: 1 as const, pooled: 1 as const })));
    if (flags.length) await db.flags.bulkPut(flags.map((f) => ({ ...f, uploaded: 1 as const, pooled: 1 as const })));
    if (sessions.length) await db.sessions.bulkPut(sessions.map((s) => ({ ...s, uploaded: 1 as const })));
  });
}

/** 익명 풀이 기록 모듈용: 아직 보내지 않은 기록 */
export async function pendingPool(limit = 400): Promise<{ attempts: Attempt[]; flags: Flag[] }> {
  return {
    attempts: (await db.attempts.where('pooled').equals(0).limit(limit).toArray()).map(strip<Attempt>),
    flags: (await db.flags.where('pooled').equals(0).limit(limit).toArray()).map(strip<Flag>),
  };
}

export async function markPooled(kind: 'attempts' | 'flags', ids: string[]): Promise<void> {
  const table = kind === 'attempts' ? db.attempts : db.flags;
  await table.bulkUpdate(ids.map((key) => ({ key, changes: { pooled: 1 as const } })));
}

export async function pendingUploads(kind: RecordKind): Promise<{ id: string }[]> {
  return (await table(kind).where('uploaded').equals(0).toArray()).map(strip);
}

export async function markUploaded(kind: RecordKind, ids: string[]): Promise<void> {
  await table(kind).bulkUpdate(ids.map((key) => ({ key, changes: { uploaded: 1 as const } })));
}
