import { Component, useState, type ReactNode } from 'react';
import { modes } from '../app/engine';
import { Home } from './Home';
import { Practice, type SessionSummary } from './Practice';
import type { PlaySpec } from './practiceState';
import { clearPractice } from './practiceState';
import { Records } from './Records';
import { Settings } from './Settings';
import { Summary } from './Summary';

/** 화면이 몇 개뿐이라 라우터 없이 상태로 전환한다 (GitHub Pages 새로고침 404 문제도 없음) */
type Screen =
  | { name: 'home' }
  | { name: 'practice'; spec: PlaySpec }
  | { name: 'summary'; summary: SessionSummary }
  | { name: 'settings' }
  | { name: 'records' };

/** 렌더 중 오류(문항 생성 실패, 깨진 저장값 등) → 흰 화면 대신 안내와 복구 버튼 */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="screen">
        <main className="empty">
          <p>화면을 그리다 문제가 생겼어요.</p>
          <p className="muted small">{this.state.error.message}</p>
          <button
            className="primary"
            onClick={() => {
              clearPractice();
              location.reload();
            }}
          >
            처음으로
          </button>
        </main>
      </div>
    );
  }
}

export function App() {
  return (
    <ErrorBoundary>
      <Screens />
    </ErrorBoundary>
  );
}

function Screens() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const home = () => setScreen({ name: 'home' });
  const start = (spec: PlaySpec) => setScreen({ name: 'practice', spec });

  switch (screen.name) {
    case 'practice':
      return (
        <Practice
          key={`${screen.spec.modeId}:${screen.spec.typeId}`}
          spec={screen.spec}
          onExit={(summary) => (summary ? setScreen({ name: 'summary', summary }) : home())}
        />
      );
    case 'summary':
      return (
        <Summary summary={screen.summary} onContinue={() => start(screen.summary.spec)} onHome={home} />
      );
    case 'settings':
      return <Settings onBack={home} onReset={home} />;
    case 'records':
      return <Records onBack={home} onStart={() => start({ modeId: modes.modes[0].id, typeId: null })} />;
    default:
      return (
        <Home
          onStart={start}
          onSettings={() => setScreen({ name: 'settings' })}
          onRecords={() => setScreen({ name: 'records' })}
        />
      );
  }
}
