/**
 * 익명 풀이 기록: 모든 사용자의 풀이를 문항 보정용으로 모은다 (Firestore poolAttempts / poolFlags).
 *  - 로그인 없이 "생성"만 가능하고, 읽기는 소유자 계정만 (firestore.rules)
 *  - 계정 정보와 자유 메모(Flag.note)는 보내지 않는다. 기기 구분은 무작위 id 하나
 *  - 소유자는 `npm run pool:pull`로 받아 `npm run calibrate`에 그대로 넣는다
 * Firebase 설정(VITE_FIREBASE_*)이 없으면 아무것도 하지 않는다.
 */
import { readJson, writeJson } from '../app/prefs';
import { markPooled, newId, onLocalWrite, pendingPool } from './records';
import { loadServices, syncConfigured } from './sync';
import type { Attempt, Flag } from './types';

function deviceId(): string {
  const saved = readJson<{ id: string }>('device', { id: '' }).id;
  if (saved) return saved;
  const id = globalThis.crypto?.randomUUID?.() ?? newId();
  writeJson('device', { id });
  return id;
}

const attemptDoc = (a: Attempt, device: string) => ({
  device,
  ts: a.ts,
  mode: a.mode,
  itemId: a.itemId,
  source: a.source,
  typeId: a.typeId,
  difficulty: a.difficulty,
  seed: a.seed,
  bankId: a.bankId,
  configVersion: a.configVersion,
  appVersion: a.appVersion,
  terms: a.terms,
  question: a.question,
  answer: a.answer,
  choices: a.choices,
  chosen: a.chosen,
  correct: a.correct,
  elapsedMs: a.elapsedMs,
});

/** note(자유 입력)는 빼고 사유 칩만 */
const flagDoc = (f: Flag, device: string) => ({
  device,
  ts: f.ts,
  attemptId: f.attemptId,
  itemId: f.itemId,
  typeId: f.typeId,
  difficulty: f.difficulty,
  seed: f.seed,
  configVersion: f.configVersion,
  terms: f.terms,
  question: f.question,
  answer: f.answer,
  choices: f.choices,
  reasons: f.reasons,
});

const isDenied = (e: unknown) => (e as { code?: string }).code === 'permission-denied';

async function send(): Promise<void> {
  const { db } = await loadServices();
  const { doc, serverTimestamp, setDoc, writeBatch } = await import('firebase/firestore');
  const device = deviceId();
  const pending = await pendingPool();
  const jobs = [
    { kind: 'attempts', coll: 'poolAttempts', rows: pending.attempts, toDoc: attemptDoc },
    { kind: 'flags', coll: 'poolFlags', rows: pending.flags, toDoc: flagDoc },
  ] as const;
  for (const { kind, coll, rows, toDoc } of jobs) {
    if (!rows.length) continue;
    const data = (r: (typeof rows)[number]) => ({ ...toDoc(r as never, device), at: serverTimestamp() });
    try {
      const batch = writeBatch(db);
      for (const r of rows) batch.set(doc(db, coll, r.id), data(r));
      await batch.commit();
    } catch (e) {
      if (!isDenied(e)) throw e; // 네트워크 등: 다음 기회에 다시
      // 이미 보낸 문서(가져오기로 다시 들어온 기록 등)가 섞이면 배치 전체가 거부된다 → 한 건씩, 거부된 건 건너뜀
      for (const r of rows) {
        try {
          await setDoc(doc(db, coll, r.id), data(r));
        } catch (err) {
          if (!isDenied(err)) throw err;
        }
      }
    }
    await markPooled(kind, rows.map((r) => r.id));
  }
}

let running: Promise<void> | null = null;
function flush(): void {
  if (!navigator.onLine || running) return;
  running = send()
    .catch(() => undefined) // 조용히: 실패하면 다음 기회에
    .finally(() => (running = null));
}

let timer: number | undefined;
const schedule = (ms: number) => {
  window.clearTimeout(timer);
  timer = window.setTimeout(flush, ms);
};

/** 앱 시작 시 1회 */
export function initPool(): void {
  if (!syncConfigured) return;
  onLocalWrite(() => schedule(5000));
  window.addEventListener('online', () => schedule(1000));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(2000);
  });
  schedule(10000);
}
