import {
  ChartColumn,
  ChevronRight,
  ClipboardCheck,
  Heart,
  Infinity as InfinityIcon,
  Lock,
  Play,
  Settings as SettingsIcon,
  Target,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { config, modes } from '../app/engine';
import { loadGameUi, saveGameUi } from '../app/prefs';
import { skillOf, weakWeights } from '../game/adapt';
import { recordSummary, type RecordSummary } from '../store/records';
import { IconButton, Stars } from './parts';
import { playTitle } from './Practice';
import { loadSkills, savedPractice, type PlaySpec } from './practiceState';

interface Props {
  onStart(spec: PlaySpec): void;
  onSettings(): void;
  onRecords(): void;
}

/** 모드 id → 아이콘 (modes.yaml에 새 모드가 생기면 Play) */
const MODE_ICON: Record<string, LucideIcon> = {
  practice: InfinityIcon,
  exam: ClipboardCheck,
  'time-attack': Timer,
  survival: Heart,
  weak: Target,
};
const iconOf = (id: string) => MODE_ICON[id] ?? Play;

/** 첫 방문 안내의 예시 문제 */
const INTRO = { terms: [3, 6, 12, 24], answer: 48, choices: [36, 42, 48], rule: '앞 수에 ×2씩' };

/** 홈: 숫자 없이 [무제한 연습] + 모드 카드만. 통계는 기록 화면에서 */
export function Home({ onStart, onSettings, onRecords }: Props) {
  const [sum, setSum] = useState<RecordSummary | null>(null);
  const [ui, setUi] = useState(loadGameUi);
  const [introPick, setIntroPick] = useState<number | null>(null);
  const saved = savedPractice();
  const types = config.types.filter((t) => t.enabled).sort((a, b) => b.weight - a.weight);
  const [main, ...others] = modes.modes;
  const MainIcon = iconOf(main.id);

  useEffect(() => {
    recordSummary().then(setSum, () => setSum(null));
  }, []);

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
      <header className="topbar home-bar">
        <h1 className="brand">수열추리</h1>
        <div className="topbar-actions">
          <IconButton label="기록 보기" onClick={onRecords}>
            <ChartColumn aria-hidden />
          </IconButton>
          <IconButton label="설정" onClick={onSettings}>
            <SettingsIcon aria-hidden />
          </IconButton>
        </div>
      </header>

      <main className="home-main">
        {showIntro && (
          <section className="card intro" aria-label="처음 오셨나요">
            <h2>규칙을 찾아 빈칸을 채우는 숫자 퍼즐</h2>
            <p className="muted">수열의 규칙을 찾아 ?에 들어갈 수를 고르세요. 연속으로 맞히면 콤보가 쌓여요.</p>
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
              <ol className="choice-row">
                {INTRO.choices.map((c) => (
                  <li key={c}>
                    <button className="choice" onClick={() => setIntroPick(c)}>
                      {c}
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p aria-live="polite">
                <b>{introPick === INTRO.answer ? '맞았어요!' : `아쉬워요. 정답은 ${INTRO.answer}`}</b> {INTRO.rule} 커져요.
              </p>
            )}
            <div className="button-row">
              <button className="button ghost" onClick={() => endIntro(false)}>
                건너뛰기
              </button>
              <button className="button primary grow" onClick={() => endIntro(true)}>
                시작하기
              </button>
            </div>
          </section>
        )}

        <button className="hero" onClick={() => onStart({ modeId: main.id, typeId: null })}>
          <span className="hero-icon" aria-hidden>
            <MainIcon />
          </span>
          <span className="hero-text">
            <b>{main.label}</b>
            <span>{main.description}</span>
          </span>
          <ChevronRight className="hero-go" aria-hidden />
        </button>

        {resume && (
          <button className="button ghost" onClick={() => onStart(resume)}>
            {playTitle(resume)} 이어 하기
          </button>
        )}

        <section aria-labelledby="modes-title">
          <h2 id="modes-title" className="section-title">
            모드
          </h2>
          <ul className="mode-grid">
            {others.map((m) => {
              const spec = specFor(m.id);
              const Icon = spec ? iconOf(m.id) : Lock;
              return (
                <li key={m.id}>
                  <button className="mode-card" disabled={!spec} onClick={() => spec && onStart(spec)}>
                    <Icon className="mode-icon" aria-hidden />
                    <b>{m.label}</b>
                    <span>{spec ? m.description : '유형별로 3문제 이상 풀면 열려요'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* 유형 골라 연습: config/modes.yaml 기본 모드의 typeSelect로 켜고 끈다 */}
        {main.typeSelect && (
          <details className="type-pick">
            <summary className="section-title">유형 골라 {main.label}</summary>
            <ul className="list card">
              {types.map((t) => (
                <li key={t.id}>
                  <button className="list-row" onClick={() => onStart({ modeId: main.id, typeId: t.id })}>
                    <span className="grow">{t.label}</span>
                    <Stars level={skillOf(loadSkills(), t.id).level} />
                    <ChevronRight className="muted" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </main>
    </div>
  );
}
