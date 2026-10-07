import { useState } from 'react';
import { Home } from './Home';
import { Practice } from './Practice';
import { Settings } from './Settings';

/** 화면이 3개뿐이라 라우터 없이 상태로 전환한다 (GitHub Pages 새로고침 404 문제도 없음) */
type Screen = { name: 'home' } | { name: 'practice'; mode: string } | { name: 'settings' };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const home = () => setScreen({ name: 'home' });

  switch (screen.name) {
    case 'practice':
      return <Practice key={screen.mode} mode={screen.mode} onExit={home} />;
    case 'settings':
      return <Settings onBack={home} />;
    default:
      return (
        <Home
          onStart={(mode) => setScreen({ name: 'practice', mode })}
          onSettings={() => setScreen({ name: 'settings' })}
        />
      );
  }
}
