import { useEffect, useState } from 'react';
import { config } from '../app/engine';
import { todayStats } from '../store/records';
import { savedPracticeMode } from './practiceState';

interface Props {
  onStart(mode: string): void;
  onSettings(): void;
}

export function Home({ onStart, onSettings }: Props) {
  const [today, setToday] = useState<{ solved: number; correct: number } | null>(null);
  const resumeMode = savedPracticeMode();
  // 출제 비중이 큰 유형부터
  const types = config.types.filter((t) => t.enabled).sort((a, b) => b.weight - a.weight);

  useEffect(() => {
    todayStats().then(setToday, () => setToday(null));
  }, []);

  return (
    <div className="screen home">
      <header className="home-head">
        <h1>수열추리</h1>
        <p className="muted">
          {today && today.solved > 0
            ? `오늘 ${today.solved}문제 · 정답률 ${Math.round((today.correct / today.solved) * 100)}%`
            : '오늘 아직 풀지 않았어요'}
        </p>
      </header>

      <main className="home-main">
        <button className="primary big" onClick={() => onStart('all')}>
          전체 유형 무작위
          <span className="sub">끝없이 이어서 풀기</span>
        </button>
        {resumeMode && resumeMode !== 'all' && (
          <button className="ghost" onClick={() => onStart(resumeMode)}>
            이어 풀기 · {types.find((t) => t.id === resumeMode)?.label ?? resumeMode}
          </button>
        )}

        <h2>유형별 풀기</h2>
        <ul className="type-list">
          {types.map((t) => (
            <li key={t.id}>
              <button onClick={() => onStart(t.id)}>{t.label}</button>
            </li>
          ))}
        </ul>
      </main>

      <footer className="home-foot">
        <button className="link" onClick={onSettings}>
          설정 · 기록 · 동기화
        </button>
        <span className="muted small">출제 설정 v{config.version}</span>
      </footer>
    </div>
  );
}
