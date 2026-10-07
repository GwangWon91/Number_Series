import { useEffect, useState, type FormEvent } from 'react';
import { getSyncState, signIn, signOut, subscribeSync, syncNow, type SyncState } from '../store/sync';

export function SyncPanel({ onSynced }: { onSynced(): void }) {
  const [sync, setSync] = useState<SyncState>(getSyncState);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeSync(setSync), []);
  useEffect(() => {
    if (sync.status === 'idle') onSynced();
  }, [sync.status, sync.lastSyncAt, onSynced]);

  if (sync.status === 'unavailable') {
    return <p className="muted small">이 배포본에는 동기화가 설정되지 않았습니다. 기록은 이 기기에만 저장됩니다.</p>;
  }
  if (sync.status === 'loading') return <p className="muted small">불러오는 중…</p>;

  if (sync.status === 'signed-out') {
    const submit = (create: boolean) => async (e?: FormEvent) => {
      e?.preventDefault();
      setBusy(true);
      setError('');
      try {
        await signIn(email.trim(), password, create);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    };
    return (
      <form className="sync-form" onSubmit={submit(false)}>
        <input type="email" autoComplete="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input
          type="password"
          autoComplete="current-password"
          placeholder="비밀번호 (6자 이상)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
        />
        <div className="next-row">
          <button type="button" className="ghost" disabled={busy} onClick={() => void submit(true)()}>
            계정 만들기
          </button>
          <button type="submit" className="primary wide" disabled={busy}>
            로그인
          </button>
        </div>
        {error && <p className="notice ng">{error}</p>}
        <p className="muted small">로그인하면 이 기기의 기록을 올리고, 다른 기기의 기록을 받아옵니다.</p>
      </form>
    );
  }

  return (
    <div>
      <p>
        {sync.email}
        <span className="muted small block">
          {sync.status === 'syncing'
            ? '동기화 중…'
            : sync.lastSyncAt
              ? `마지막 동기화 ${new Date(sync.lastSyncAt).toLocaleTimeString('ko-KR')}`
              : '대기 중'}
        </span>
      </p>
      {sync.status === 'error' && <p className="notice ng">동기화 오류: {sync.error}</p>}
      <div className="btn-col">
        <button onClick={() => void syncNow()} disabled={sync.status === 'syncing'}>
          지금 동기화
        </button>
        <button className="ghost" onClick={() => void signOut()}>
          로그아웃
        </button>
      </div>
    </div>
  );
}
