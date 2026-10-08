/**
 * 기기 간 기록 동기화 (Firebase Auth 이메일/비밀번호 + Firestore).
 *
 * 구조: 로컬(IndexedDB)이 원본. 로그인 상태면
 *  - push: 아직 올리지 않은 기록(uploaded=0)을 users/{uid}/{attempts|flags|sessions}/{id}에 set
 *  - pull: 마지막으로 받은 이후 syncedAt이 바뀐 문서를 받아 로컬에 병합
 * 기록은 추가만 하므로(append-only) 같은 id를 여러 번 써도 충돌이 없다.
 *
 * Firebase 설정(VITE_FIREBASE_*)이 없으면 동기화 기능은 꺼진 채로 앱이 동작한다.
 * Firebase SDK는 동기화를 쓸 때만 동적으로 불러온다 (첫 로딩 용량 절약).
 */
import type { FirebaseApp } from 'firebase/app';
import type { Auth, User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { readJson, writeJson } from '../app/prefs';
import { markUploaded, mergeRemote, onLocalWrite, pendingUploads, type RecordKind } from './records';
import type { Attempt, Flag, Session } from './types';

const env = import.meta.env;
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
};

export const syncConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

export interface SyncState {
  status: 'unavailable' | 'loading' | 'signed-out' | 'idle' | 'syncing' | 'error';
  email?: string;
  lastSyncAt?: number;
  error?: string;
}

let state: SyncState = { status: syncConfigured ? 'loading' : 'unavailable' };
const listeners = new Set<(s: SyncState) => void>();
const setState = (patch: Partial<SyncState>) => {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn(state));
};

export const getSyncState = () => state;
export function subscribeSync(fn: (s: SyncState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let services: Promise<{ app: FirebaseApp; auth: Auth; db: Firestore }> | null = null;
let user: User | null = null;

/** Firebase 지연 로딩 (동기화·익명 풀이 기록이 같이 쓴다) */
export function loadServices() {
  services ??= (async () => {
    const [{ initializeApp }, { getAuth }, { initializeFirestore }] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/firestore'),
    ]);
    const app = initializeApp(firebaseConfig);
    // seed/bankId처럼 비어 있을 수 있는 필드를 그대로 저장하기 위해 undefined 무시
    const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
    return { app, auth: getAuth(app), db };
  })();
  return services;
}

const pullKey = (uid: string) => `sync-pulled-${uid}`;
const KINDS: readonly RecordKind[] = ['attempts', 'flags', 'sessions'];

async function push(uid: string): Promise<void> {
  const { db } = await loadServices();
  const { doc, serverTimestamp, writeBatch } = await import('firebase/firestore');
  for (const kind of KINDS) {
    const rows = await pendingUploads(kind);
    for (let i = 0; i < rows.length; i += 400) {
      const chunk = rows.slice(i, i + 400);
      const batch = writeBatch(db);
      for (const r of chunk) batch.set(doc(db, 'users', uid, kind, r.id), { ...r, syncedAt: serverTimestamp() });
      await batch.commit();
      await markUploaded(kind, chunk.map((r) => r.id));
    }
  }
}

async function pull(uid: string): Promise<void> {
  const { db } = await loadServices();
  const { collection, getDocs, orderBy, query, Timestamp, where } = await import('firebase/firestore');
  const since = readJson<{ ms: number }>(pullKey(uid), { ms: 0 }).ms;
  let newest = since;
  const fetch = async <T>(kind: RecordKind) => {
    const snap = await getDocs(
      query(collection(db, 'users', uid, kind), where('syncedAt', '>', Timestamp.fromMillis(since)), orderBy('syncedAt')),
    );
    return snap.docs.map((d) => {
      const { syncedAt, ...rest } = d.data();
      newest = Math.max(newest, (syncedAt as InstanceType<typeof Timestamp>).toMillis());
      return rest as T;
    });
  };
  const [attempts, flags, sessions] = await Promise.all([
    fetch<Attempt>('attempts'),
    fetch<Flag>('flags'),
    fetch<Session>('sessions'),
  ]);
  await mergeRemote({ attempts, flags, sessions });
  writeJson(pullKey(uid), { ms: newest });
}

let running: Promise<void> | null = null;

export function syncNow(): Promise<void> {
  if (!user) return Promise.resolve();
  if (!navigator.onLine) return Promise.resolve();
  const uid = user.uid;
  running ??= (async () => {
    setState({ status: 'syncing', error: undefined });
    try {
      await push(uid);
      await pull(uid);
      setState({ status: 'idle', lastSyncAt: Date.now() });
    } catch (e) {
      setState({ status: 'error', error: (e as Error).message });
    } finally {
      running = null;
    }
  })();
  return running;
}

let pushTimer: number | undefined;
const schedulePush = () => {
  window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => void syncNow(), 3000);
};

/** 앱 시작 시 1회 호출 */
export async function initSync(): Promise<void> {
  if (!syncConfigured) return;
  try {
    const { auth } = await loadServices();
    const { onAuthStateChanged } = await import('firebase/auth');
    onAuthStateChanged(auth, (u) => {
      user = u;
      setState(u ? { status: 'idle', email: u.email ?? undefined } : { status: 'signed-out', email: undefined });
      if (u) void syncNow();
    });
    onLocalWrite(schedulePush);
    window.addEventListener('online', () => void syncNow());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void syncNow();
    });
  } catch (e) {
    setState({ status: 'error', error: (e as Error).message });
  }
}

const AUTH_ERRORS: Record<string, string> = {
  'auth/invalid-credential': '이메일 또는 비밀번호가 맞지 않습니다',
  'auth/invalid-email': '이메일 형식이 아닙니다',
  'auth/email-already-in-use': '이미 가입된 이메일입니다 — 로그인하세요',
  'auth/weak-password': '비밀번호는 6자 이상이어야 합니다',
  'auth/network-request-failed': '네트워크에 연결할 수 없습니다',
  'auth/too-many-requests': '시도가 너무 많습니다. 잠시 후 다시 시도하세요',
};
const authMessage = (e: unknown) => AUTH_ERRORS[(e as { code?: string }).code ?? ''] ?? (e as Error).message;

export async function signIn(email: string, password: string, create: boolean): Promise<void> {
  const { auth } = await loadServices();
  const m = await import('firebase/auth');
  try {
    if (create) await m.createUserWithEmailAndPassword(auth, email, password);
    else await m.signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    throw new Error(authMessage(e));
  }
}

export async function signOut(): Promise<void> {
  const { auth } = await loadServices();
  const { signOut: out } = await import('firebase/auth');
  await out(auth);
}
