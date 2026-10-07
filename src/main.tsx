import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, loadPrefs } from './app/prefs';
import { initSync } from './store/sync';
import { App } from './ui/App';
import './ui/styles.css';

applyTheme(loadPrefs().theme);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void initSync();
