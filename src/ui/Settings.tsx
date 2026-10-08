import { useCallback, useEffect, useRef, useState } from 'react';
import { config } from '../app/engine';
import { applyTheme, loadPrefs, savePrefs, THEME_OPTIONS, type Prefs } from '../app/prefs';
import { BUILD_LABEL } from '../app/version';
import { counts, exportAll, importAll } from '../store/records';
import type { ExportFile } from '../store/types';
import { SyncPanel } from './SyncPanel';

export function Settings({ onBack }: { onBack(): void }) {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [stats, setStats] = useState({ attempts: 0, flags: 0 });
  const [message, setMessage] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => void counts().then(setStats, () => undefined), []);
  useEffect(refresh, [refresh]);

  const updatePrefs = (p: Prefs) => {
    setPrefs(p);
    savePrefs(p);
  };

  const download = async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `skct-records-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const upload = async (file: File) => {
    try {
      const added = await importAll(JSON.parse(await file.text()) as ExportFile);
      setMessage(`가져옴: 기록 ${added.attempts}건, 표시 ${added.flags}건`);
      void refresh();
    } catch (e) {
      setMessage(`가져오기 실패: ${(e as Error).message}`);
    }
  };

  const latest = config.changelog[config.changelog.length - 1];

  return (
    <div className="screen settings">
      <header className="bar-head">
        <button className="icon" onClick={onBack} aria-label="홈으로">
          ←
        </button>
        <div className="head-title">
          <span>설정</span>
        </div>
      </header>

      <main className="settings-main">
        <section>
          <h2>풀이</h2>
          <label className="row">
            <input
              type="checkbox"
              checked={prefs.confirmBeforeSubmit}
              onChange={(e) => updatePrefs({ ...prefs, confirmBeforeSubmit: e.target.checked })}
            />
            <span>
              제출 전 확인
              <span className="muted small block">선택한 뒤 한 번 더 눌러야 제출 (오탭 방지)</span>
            </span>
          </label>
        </section>

        <section>
          <h2>효과</h2>
          <label className="row">
            <input type="checkbox" checked={prefs.sound} onChange={(e) => updatePrefs({ ...prefs, sound: e.target.checked })} />
            <span>효과음</span>
          </label>
          <label className="row">
            <input
              type="checkbox"
              checked={prefs.haptics}
              onChange={(e) => updatePrefs({ ...prefs, haptics: e.target.checked })}
            />
            <span>
              진동
              <span className="muted small block">지원하는 기기에서만 (iPhone은 지원하지 않음)</span>
            </span>
          </label>
        </section>

        <section>
          <h2>화면</h2>
          <div className="segmented" role="group" aria-label="화면 밝기">
            {THEME_OPTIONS.map(([value, label]) => (
              <button
                key={value}
                aria-pressed={prefs.theme === value}
                onClick={() => {
                  updatePrefs({ ...prefs, theme: value });
                  applyTheme(value);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2>기기 간 동기화</h2>
          <SyncPanel onSynced={refresh} />
        </section>

        <section>
          <h2>기록과 피드백</h2>
          <p className="muted">
            풀이 기록 {stats.attempts}건 · '실전과 다름' 표시 {stats.flags}건
          </p>
          <div className="btn-col">
            <button onClick={download}>내보내기 (JSON)</button>
            <button onClick={() => fileInput.current?.click()}>가져오기</button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
          </div>
          <p className="muted small">
            내보낸 파일을 data/feedback/에 넣고 <code>npm run calibrate</code>로 보정 근거를 집계합니다.
          </p>
          {message && <p className="notice">{message}</p>}
        </section>

        <section>
          <h2>버전</h2>
          <p className="muted small">앱 {BUILD_LABEL}</p>
          <p className="muted small">
            출제 설정 v{config.version}
            {latest ? ` · ${latest.date} · ${latest.note}` : ''}
          </p>
          <p className="muted small">
            유형·비중·숫자 범위는 실전 자료가 쌓이는 대로 보정 중인 추정값입니다. 실전과 다른 문항은 풀이 화면의
            '실전과 다름'으로 알려 주세요.
          </p>
        </section>
      </main>
    </div>
  );
}
