import { useEffect, useState } from 'react';
import { config, modes } from '../app/engine';
import { applyTheme, loadGameUi, loadPrefs, saveGameUi, savePrefs, THEME_OPTIONS, type Theme } from '../app/prefs';
import { skillOf, weakWeights } from '../game/adapt';
import { bestScores, recordSummary, type RecordSummary } from '../store/records';
import { playTitle } from './Practice';
import { loadSkills, savedPractice, type PlaySpec } from './practiceState';

interface Props {
  onStart(spec: PlaySpec): void;
  onSettings(): void;
  onRecords(): void;
}

/** 오늘의 수열에 보여 줄 최대 칸 수 (넘으면 앞쪽을 "+N"으로 줄인다) */
const STRIP_MAX = 34;

/** 첫 방문 안내의 예시 문제 */
const INTRO = { terms: [3, 6, 12, 24], answer: 48, choices: [36, 42, 48], rule: '앞 수에 ×2씩' };

/** 텍스트 표시 문자(\uFE0E)로 이모지 렌더링을 막는다 */
const THEME_ICON: Record<Theme, string> = { system: '◐', light: '☀\uFE0E', dark: '☾' };

export function Home({ onStart, onSettings, onRecords }: Props) {
  const [sum, setSum] = useState<RecordSummary | null>(null);
  const [theme, setTheme] = useState(() => loadPrefs().theme);
  const themeIndex = THEME_OPTIONS.findIndex(([t]) => t === theme);
  const cycleTheme = () => {
    const next = THEME_OPTIONS[(themeIndex + 1) % THEME_OPTIONS.length][0];
    savePrefs({ ...loadPrefs(), theme: next });
    applyTheme(next);
    setTheme(next);
  };
  const [bests, setBests] = useState<Record<string, number>>({});
  const [ui, setUi] = useState(loadGameUi);
  const [introPick, setIntroPick] = useState<number | null>(null);
  const saved = savedPractice();
  // 출제 비중이 큰 유형부터
  const types = config.types.filter((t) => t.enabled).sort((a, b) => b.weight - a.weight);
  const skills = loadSkills();
  const [main, ...others] = modes.modes;

  useEffect(() => {
    recordSummary().then(setSum, () => setSum(null));
    bestScores().then(setBests, () => undefined);
  }, []);

  const today = sum?.today ?? [];
  const correct = today.filter(Boolean).length;
  const shown = today.slice(-STRIP_MAX);
  const hidden = today.length - shown.length;
  const byType = new Map((sum?.byType ?? []).map((r) => [r.key, r]));
  const weak = weakWeights(sum?.byType ?? [], new Set(types.map((t) => t.id)));
  // 기본 모드의 전체 무작위가 아닌 진행 중 세션만 따로 '이어 하기'
  const resume = saved && saved.mode !== 'all' ? saved.spec : null;
  const showIntro = !ui.onboarded && sum !== null && sum.total === 0;
  const endIntro = (start: boolean) => {
    const next = { ...ui, onboarded: true };
    saveGameUi(next);
    setUi(next);
    if (start) onStart({ modeId: main.id, typeId: null });
  };
  const specFor = (modeId: string): PlaySpec | null => {
    const m = modes.modes.find((x) => x.id === modeId)!;
    if (m.pool !== 'weak') return { modeId, typeId: null };
    return weak ? { modeId, typeId: null, typeWeights: weak } : null;
  };

  return (
    <div className="screen home">
      <header className="home-head">
        <h1>수열추리</h1>
        <div className="head-actions">
          <button className="icon" onClick={cycleTheme} aria-label={`화면 밝기: ${THEME_OPTIONS[themeIndex][1]}`}>
            {THEME_ICON[theme]}
          </button>
          <button className="link" onClick={onRecords}>
            기록 보기
          </button>
        </div>
      </header>

      <main className="home-main">
        {showIntro && (
          <section className="intro" aria-label="처음 오셨나요">
            <h2>규칙을 찾아 빈칸을 채우는 숫자 퍼즐</h2>
            <p className="muted small">수열의 규칙을 찾아 ?에 들어갈 수를 고르세요. 연속으로 맞히면 콤보가 쌓여요.</p>
            <div className="sequence" role="text">
              {INTRO.terms.map((t) => (
                <span key={t} className="term">
                  {t}
                </span>
              ))}
              <span className={`term blank ${introPick === null ? '' : introPick === INTRO.answer ? 'ok' : 'ng'}`}>
                {introPick === null ? '?' : INTRO.answer}
              </span>
            </div>
            {introPick === null ? (
              <ol className="choices">
                {INTRO.choices.map((c) => (
                  <li key={c}>
                    <button onClick={() => setIntroPick(c)}>{c}</button>
                  </li>
                ))}
              </ol>
            ) : (
              <p aria-live="polite">
                <b>{introPick === INTRO.answer ? '맞았어요!' : `아쉬워요. 정답은 ${INTRO.answer}`}</b> {INTRO.rule} 커져요.
              </p>
            )}
            <div className="next-row">
              <button className="ghost" onClick={() => endIntro(false)}>
                건너뛰기
              </button>
              <button className="primary wide" onClick={() => endIntro(true)}>
                시작하기
              </button>
            </div>
          </section>
        )}

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
              <span>
                지금까지 <b>{sum.total}</b>문제
              </span>
            </p>
          )}
          <button className="primary start" onClick={() => onStart({ modeId: main.id, typeId: null })}>
            {today.length > 0 ? '이어서 풀기' : '풀기 시작'}
          </button>
        </section>

        {resume && (
          <button className="ghost" onClick={() => onStart(resume)}>
            {playTitle(resume)} 이어 하기
          </button>
        )}

        <h2>모드</h2>
        <ul className="mode-grid">
          {others.map((m) => {
            const spec = specFor(m.id);
            return (
              <li key={m.id}>
                <button disabled={!spec} onClick={() => spec && onStart(spec)}>
                  <b>{m.label}</b>
                  <span className="muted small">
                    {spec ? m.description : '유형별로 3문제 이상 풀면 열려요'}
                  </span>
                  {bests[m.id] !== undefined && <span className="best small">최고 {bests[m.id].toLocaleString()}점</span>}
                </button>
              </li>
            );
          })}
        </ul>

        <details className="type-pick">
          <summary>유형 골라 {main.label}</summary>
          <ul className="type-list">
          {types.map((t) => {
            const r = byType.get(t.id);
            const acc = r ? Math.round(((r.solved - r.wrong) / r.solved) * 100) : null;
            const level = skillOf(skills, t.id).level;
            return (
              <li key={t.id}>
                <button onClick={() => onStart({ modeId: main.id, typeId: t.id })}>
                  <span className="name">
                    {t.label}
                    <span className="stars" aria-label={`숙련 ${level}단계`}>
                      {' '}
                      {'★'.repeat(level)}
                      {'☆'.repeat(3 - level)}
                    </span>
                  </span>
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
        </details>
      </main>

      <footer className="home-foot">
        <button className="link" onClick={onSettings}>
          설정과 동기화
        </button>
      </footer>
    </div>
  );
}
