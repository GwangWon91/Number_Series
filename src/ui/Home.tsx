import { useEffect, useState } from 'react';
import { config } from '../app/engine';
import { BUILD_LABEL } from '../app/version';
import { recordSummary, type RecordSummary } from '../store/records';
import { savedPracticeMode } from './practiceState';

interface Props {
  onStart(mode: string): void;
  onSettings(): void;
  onRecords(): void;
}

/** 오늘의 수열에 보여 줄 최대 칸 수 (넘으면 앞쪽을 "+N"으로 줄인다) */
const STRIP_MAX = 34;

export function Home({ onStart, onSettings, onRecords }: Props) {
  const [sum, setSum] = useState<RecordSummary | null>(null);
  const resumeMode = savedPracticeMode();
  // 출제 비중이 큰 유형부터
  const types = config.types.filter((t) => t.enabled).sort((a, b) => b.weight - a.weight);

  useEffect(() => {
    recordSummary().then(setSum, () => setSum(null));
  }, []);

  const today = sum?.today ?? [];
  const correct = today.filter(Boolean).length;
  const shown = today.slice(-STRIP_MAX);
  const hidden = today.length - shown.length;
  const byType = new Map((sum?.byType ?? []).map((r) => [r.key, r]));
  const resumeLabel = resumeMode && resumeMode !== 'all' ? types.find((t) => t.id === resumeMode)?.label : null;

  return (
    <div className="screen home">
      <header className="home-head">
        <h1>수열추리</h1>
        <button className="link" onClick={onRecords}>
          기록 보기
        </button>
      </header>

      <main className="home-main">
        <section className="today" aria-label="오늘 푼 문제">
          <p className="today-line">
            {today.length > 0 ? (
              <>
                오늘 <span className="num">{today.length}</span>문제 풀고 <span className="num">{correct}</span>개
                맞혔어요
              </>
            ) : (
              '오늘의 첫 문제를 풀어 볼까요'
            )}
          </p>
          {/* 오늘 푼 문제가 칸 하나씩 (초록 정답, 빨강 오답), 마지막 빈칸이 다음 문제 */}
          <ol className="strip" aria-hidden>
            {hidden > 0 && <li className="more">+{hidden}</li>}
            {shown.map((ok, i) => (
              <li key={i} className={ok ? 'ok' : 'ng'} />
            ))}
            <li className="next">?</li>
          </ol>
          {sum && sum.total > 0 && (
            <p className="today-meta">
              {today.length > 0 && (
                <span>
                  정답률 <b>{Math.round((correct / today.length) * 100)}%</b>
                </span>
              )}
              {sum.streakDays > 1 && (
                <span>
                  <b>{sum.streakDays}</b>일 연속
                </span>
              )}
              <span>
                지금까지 <b>{sum.total}</b>문제
              </span>
            </p>
          )}
          <button className="primary start" onClick={() => onStart('all')}>
            {today.length > 0 ? '이어서 풀기' : '풀기 시작'}
          </button>
        </section>

        {resumeLabel && (
          <button className="ghost" onClick={() => onStart(resumeMode!)}>
            {resumeLabel} 이어 풀기
          </button>
        )}

        <h2>유형별로 풀기</h2>
        <ul className="type-list">
          {types.map((t) => {
            const r = byType.get(t.id);
            const acc = r ? Math.round(((r.solved - r.wrong) / r.solved) * 100) : null;
            return (
              <li key={t.id}>
                <button onClick={() => onStart(t.id)}>
                  <span className="name">{t.label}</span>
                  <span className="stat">
                    {r ? (
                      <>
                        <b className={acc! < 60 ? 'low' : ''}>{acc}%</b>
                        {r.solved}문제
                      </>
                    ) : (
                      '아직 안 풂'
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </main>

      <footer className="home-foot">
        <button className="link" onClick={onSettings}>
          설정과 동기화
        </button>
        <span className="muted small ver">
          {BUILD_LABEL}
          <br />
          출제 설정 v{config.version}
        </span>
      </footer>
    </div>
  );
}
