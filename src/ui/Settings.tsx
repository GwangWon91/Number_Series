import { Monitor, Moon, RotateCcw, Sun, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { applyTheme, loadPrefs, savePrefs, THEME_OPTIONS, type Prefs, type Theme } from '../app/prefs';
import { clearAll } from '../store/records';
import { TopBar } from './parts';

const THEME_ICON: Record<Theme, LucideIcon> = { system: Monitor, light: Sun, dark: Moon };

/** 켬/끔 한 줄 (행 전체가 누르는 영역) */
function SwitchRow({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange(v: boolean): void }) {
  return (
    <button className="list-row" role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span className="grow">
        {label}
        {hint && <span className="hint block">{hint}</span>}
      </span>
      <span className={`switch ${on ? 'on' : ''}`} aria-hidden />
    </button>
  );
}

/** 설정: 화면 테마 · 효과음/진동 · 기록 초기화 */
export function Settings({ onBack, onReset }: { onBack(): void; onReset(): void }) {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [confirming, setConfirming] = useState(false);
  const update = (p: Prefs) => {
    setPrefs(p);
    savePrefs(p);
  };

  return (
    <div className="screen settings">
      <TopBar title="설정" onBack={onBack} backLabel="홈으로" />

      <main className="stack">
        <section>
          <h2 className="section-title">화면</h2>
          <div className="segmented" role="group" aria-label="화면 밝기">
            {THEME_OPTIONS.map(([value, label]) => {
              const Icon = THEME_ICON[value];
              return (
                <button
                  key={value}
                  aria-pressed={prefs.theme === value}
                  onClick={() => {
                    update({ ...prefs, theme: value });
                    applyTheme(value);
                  }}
                >
                  <Icon aria-hidden />
                  {label}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="section-title">효과</h2>
          <div className="list card">
            <SwitchRow label="효과음" on={prefs.sound} onChange={(sound) => update({ ...prefs, sound })} />
            <SwitchRow
              label="진동"
              hint="지원하는 기기에서만 (iPhone은 지원하지 않음)"
              on={prefs.haptics}
              onChange={(haptics) => update({ ...prefs, haptics })}
            />
          </div>
        </section>

        <section>
          <h2 className="section-title">기록</h2>
          <div className="list card">
            {confirming ? (
              <div className="list-row confirm" role="alert">
                <span className="grow">푼 문제·점수·업적 기록을 모두 지울까요? 되돌릴 수 없어요.</span>
                <div className="button-row">
                  <button className="button ghost" onClick={() => setConfirming(false)}>
                    취소
                  </button>
                  <button
                    className="button danger"
                    onClick={async () => {
                      await clearAll();
                      onReset();
                    }}
                  >
                    지우기
                  </button>
                </div>
              </div>
            ) : (
              <button className="list-row danger-text" onClick={() => setConfirming(true)}>
                <RotateCcw aria-hidden />
                <span className="grow">기록 초기화</span>
              </button>
            )}
          </div>
          <p className="hint">테마·효과 설정은 그대로 남아요.</p>
        </section>
      </main>
    </div>
  );
}
