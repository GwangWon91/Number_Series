import { useState } from 'react';
import { Home } from './Home';
import { Practice } from './Practice';
import { Records } from './Records';
import { Settings } from './Settings';

/** 화면이 몇 개뿐이라 라우터 없이 상태로 전환한다 (GitHub Pages 새로고침 404 문제도 없음) */
type Screen = { name: 'home' } | { name: 'practice'; mode: string } | { name: 'settings' } | { name: 'records' };

export function App() {
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
