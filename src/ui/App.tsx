import { Component, useState, type ReactNode } from 'react';
import { Home } from './Home';
import { Practice } from './Practice';
import { clearPractice } from './practiceState';
import { Records } from './Records';
import { Settings } from './Settings';

/** 화면이 몇 개뿐이라 라우터 없이 상태로 전환한다 (GitHub Pages 새로고침 404 문제도 없음) */
type Screen = { name: 'home' } | { name: 'practice'; mode: string } | { name: 'settings' } | { name: 'records' };

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
  const start = (mode: string) => setScreen({ name: 'practice', mode });

  switch (screen.name) {
    case 'practice':
      return <Practice key={screen.mode} mode={screen.mode} onExit={home} />;
    case 'settings':
      return <Settings onBack={home} />;
    case 'records':
      return <Records onBack={home} onStart={() => start('all')} />;
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
