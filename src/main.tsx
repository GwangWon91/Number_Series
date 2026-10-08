import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, loadPrefs } from './app/prefs';
import { initPool } from './store/pool';
import { initSync } from './store/sync';
import { App } from './ui/App';
import './ui/styles.css';

applyTheme(loadPrefs().theme);
// 브라우저가 저장 공간 부족·장기 미사용 때 기록을 지우지 않도록 요청 (거절돼도 동작은 같다)
void navigator.storage?.persist?.().catch(() => undefined);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void initSync();
initPool();
