/**
 * 소유자 전용: 익명 풀이 기록(Firestore poolAttempts / poolFlags)을 받아
 * data/feedback/pool-YYYY-MM-DD.json 으로 저장한다. 앱에서 내보낸 파일과 같은 형식이라
 * 이어서 `npm run calibrate`가 그대로 집계한다 (data/feedback/는 gitignore).
 *
 *   .env.local 에 VITE_FIREBASE_* 와 POOL_OWNER_EMAIL, POOL_OWNER_PASSWORD (firestore.rules의 OWNER_UID 계정)
 *   npm run pool:pull            # 지난번 받은 이후 새 기록만
 *   npm run pool:pull -- --all   # 처음부터 전부
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { collection, getDocs, getFirestore, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { ROOT } from '../src/node/load';
import type { Attempt, ExportFile, Flag } from '../src/store/types';

const { values: args } = parseArgs({ options: { all: { type: 'boolean', default: false } } });

/** process.env 우선, 없으면 .env.local (dotenv 없이 KEY=VALUE 줄만) */
function env(key: string): string {
  if (process.env[key]) return process.env[key]!;
  const file = join(ROOT, '.env.local');
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && m[1] === key) return m[2].replace(/^['"]|['"]$/g, '');
    }
  }
  throw new Error(`${key}가 없습니다 (.env.local 확인)`);
}

const dir = join(ROOT, 'data/feedback');
const cursorFile = join(dir, 'pool-cursor.txt'); // .json이 아니어야 calibrate가 기록 파일로 읽지 않는다
const since = args.all || !existsSync(cursorFile) ? 0 : Number(readFileSync(cursorFile, 'utf8')) || 0;

const app = initializeApp({
  apiKey: env('VITE_FIREBASE_API_KEY'),
  authDomain: env('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: env('VITE_FIREBASE_PROJECT_ID'),
  appId: env('VITE_FIREBASE_APP_ID'),
});
await signInWithEmailAndPassword(getAuth(app), env('POOL_OWNER_EMAIL'), env('POOL_OWNER_PASSWORD'));
const db = getFirestore(app);

let newest = since;
const devices = new Set<string>();
async function fetch<T>(name: 'poolAttempts' | 'poolFlags', extra: Partial<T> = {}): Promise<T[]> {
  const snap = await getDocs(query(collection(db, name), where('at', '>', Timestamp.fromMillis(since)), orderBy('at')));
  return snap.docs.map((d) => {
    const { at, ...rest } = d.data();
    newest = Math.max(newest, (at as Timestamp).toMillis());
    devices.add(String(rest.device));
    return { id: d.id, ...extra, ...rest } as T;
  });
}

const attempts = await fetch<Attempt>('poolAttempts');
const flags = await fetch<Flag>('poolFlags', { note: '' });

if (!attempts.length && !flags.length) {
  console.log('새 익명 풀이 기록이 없습니다.');
  process.exit(0);
}

mkdirSync(dir, { recursive: true });
const day = new Date().toISOString().slice(0, 10);
const out = join(dir, `pool-${day}${args.all ? '-all' : ''}.json`);
const file: ExportFile = { app: 'skct-number-series', format: 1, exportedAt: new Date().toISOString(), attempts, flags };
writeFileSync(out, JSON.stringify(file));
writeFileSync(cursorFile, String(newest));
console.log(`풀이 ${attempts.length}건 · 실전과 다름 ${flags.length}건 · 기기 ${devices.size}대 → ${out}`);
console.log('다음: npm run calibrate');
process.exit(0); // Firebase 연결이 남아 있어 직접 종료
