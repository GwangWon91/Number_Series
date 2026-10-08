import { useCallback, useEffect, useRef, useState } from 'react';
import { bank, config } from '../app/engine';
import { loadPrefs } from '../app/prefs';
import { APP_VERSION } from '../app/version';
import { itemKey } from '../engine/item';
import { pickNextItem } from '../engine/session';
import { questionText } from '../engine/question';
import { eqNum, formatValue } from '../engine/value';
import { typeLabel } from '../engine/config';
import { addAttempt, addFlag, itemSnapshot, newId } from '../store/records';
import { FlagSheet } from './FlagSheet';
import { loadPractice, savePractice, type PracticeState } from './practiceState';
import { SequenceView, Term } from './SequenceView';
import { Timer } from './Timer';

interface Props {
  /** 'all' 또는 typeId */
  mode: string;
  onExit(): void;
}

function freshState(mode: string, prev?: PracticeState): PracticeState {
  const recent = prev?.recent ?? [];
  const item = pickNextItem(config, bank, {
    typeId: mode === 'all' ? null : mode,
    recentKeys: new Set(recent),
  });
  return {
    mode,
    item,
    phase: 'answering',
    chosen: null,
    elapsedMs: 0,
    attemptId: null,
    flagged: false,
    solved: prev?.solved ?? 0,
    correct: prev?.correct ?? 0,
    recent: [...recent, itemKey(item)].slice(-config.exam.avoidRecent),
  };
}

export function Practice({ mode, onExit }: Props) {
  const [state, setState] = useState<PracticeState>(() => loadPractice(mode) ?? freshState(mode));
  const [pending, setPending] = useState<number | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const startedAt = useRef(performance.now());
  const prefs = useRef(loadPrefs()).current;
  const { item, phase } = state;

  useEffect(() => savePractice(state), [state]);

  const submit = useCallback(
    (index: number) => {
      if (state.phase !== 'answering') return;
      const elapsedMs = Math.round(performance.now() - startedAt.current);
      const chosen = item.choices[index];
      const correct = eqNum(chosen, item.answer);
      const attemptId = newId();
      void addAttempt({
        id: attemptId,
        ts: Date.now(),
        mode,
        ...itemSnapshot(item),
        source: item.source,
        bankId: item.bankId,
        appVersion: APP_VERSION,
        chosen,
        correct,
        elapsedMs,
      });
      setPending(null);
      setState((s) => ({
        ...s,
        phase: 'revealed',
        chosen: index,
        elapsedMs,
        attemptId,
        solved: s.solved + 1,
        correct: s.correct + (correct ? 1 : 0),
      }));
    },
    [item, mode, state.phase],
  );

  const choose = useCallback(
    (index: number) => {
      if (phase !== 'answering') return;
      if (!prefs.confirmBeforeSubmit || pending === index) submit(index);
      else setPending(index);
    },
    [phase, pending, prefs.confirmBeforeSubmit, submit],
  );

  const next = useCallback(() => {
    setFlagOpen(false);
    setPending(null);
    startedAt.current = performance.now();
    setState((s) => freshState(mode, s));
  }, [mode]);

  // PC 단축키: 1~5 선택, Enter/Space 제출·다음, F 플래그, Esc 홈
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (flagOpen || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (phase === 'answering' && n >= 1 && n <= item.choices.length) {
        e.preventDefault();
        choose(n - 1);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (phase === 'revealed') next();
        else if (pending !== null) submit(pending);
      } else if ((e.key === 'f' || e.key === 'F') && phase === 'revealed' && !state.flagged) {
        setFlagOpen(true);
      } else if (e.key === 'Escape') {
        onExit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choose, flagOpen, item.choices.length, next, onExit, pending, phase, state.flagged, submit]);

  const saveFlag = async (reasons: string[], note: string) => {
    if (!state.attemptId) return;
    await addFlag({
      id: newId(),
      ts: Date.now(),
      attemptId: state.attemptId,
      ...itemSnapshot(item),
      reasons,
      note,
    });
    setState((s) => ({ ...s, flagged: true }));
    setFlagOpen(false);
  };

  const revealed = phase === 'revealed';
  const wasCorrect = revealed && state.chosen !== null && eqNum(item.choices[state.chosen], item.answer);

  return (
    <div className={`screen practice ${revealed ? 'revealed' : ''}`}>
      <header className="bar-head">
        <button className="icon" onClick={onExit} aria-label="홈으로">
          ←
        </button>
        <div className="head-title">
          <span>{mode === 'all' ? '전체 무작위' : typeLabel(config, mode)}</span>
        </div>
        <div className="score" aria-label={`${state.solved}문제 중 ${state.correct}문제 정답`}>
          <div>
            <b>{state.solved}</b>
            <span>푼 문제</span>
          </div>
          {/* key가 바뀌면 다시 그려져 맞힌 순간 숫자가 한 번 튄다 */}
          <div key={state.correct} className={`hit ${state.correct > 0 && wasCorrect ? 'pop' : ''}`}>
            <b>{state.correct}</b>
            <span>정답</span>
          </div>
        </div>
        <Timer
          key={item.id + state.solved}
          limitSec={config.exam.timePerItemSec}
          running={!revealed}
          frozenMs={revealed ? state.elapsedMs : undefined}
        />
      </header>

      <main className="stage">
        <p className="prompt">{questionText(item.question)}</p>
        <SequenceView
          item={item}
          revealed={revealed}
          correct={wasCorrect}
          groupSeparator={item.groupSize !== undefined}
        />
        {revealed && (
          <section className={`explain ${wasCorrect ? 'ok' : 'ng'}`} aria-live="polite">
            <p className="verdict">
              {wasCorrect ? '맞았어요' : '틀렸어요. 정답은'} <b><Term v={item.answer} /></b>
              <span className="muted small"> {(state.elapsedMs / 1000).toFixed(0)}초</span>
              {item.source === 'bank' && <span className="muted small"> 문제은행</span>}
            </p>
            {item.explain.map((line, i) => (
              <p key={i} className={i === 0 ? 'rule-name' : 'rule-line'}>
                {line}
              </p>
            ))}
          </section>
        )}
        {revealed && (
          <div className="reveal-actions">
            <ol className="choices compact">
              {item.choices.map((c, i) => {
                const isAnswer = eqNum(c, item.answer);
                const cls = isAnswer ? 'answer' : i === state.chosen ? 'wrong' : '';
                return (
                  <li key={i} className={cls}>
                    <Term v={c} />
                  </li>
                );
              })}
            </ol>
            <div className="next-row">
              <button
                className="ghost flag"
                disabled={state.flagged}
                onClick={() => setFlagOpen(true)}
                title="실전과 다른 점 표시 (F)"
              >
                {state.flagged ? '표시함' : '실전과 다름'}
              </button>
              <button className="primary wide" onClick={next} autoFocus>
                다음
              </button>
            </div>
          </div>
        )}
      </main>

      {!revealed && (
        <footer className="dock">
          <ol className="choices">
            {item.choices.map((c, i) => (
              <li key={i}>
                <button
                  className={pending === i ? 'pending' : ''}
                  onClick={() => choose(i)}
                  aria-label={`${i + 1}번 ${formatValue(c)}`}
                >
                  <span className="num">{i + 1}</span>
                  <span className="val">
                    <Term v={c} />
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {prefs.confirmBeforeSubmit && (
            <button className="primary wide" disabled={pending === null} onClick={() => pending !== null && submit(pending)}>
              제출
            </button>
          )}
        </footer>
      )}

      {flagOpen && (
        <FlagSheet reasons={config.feedback.reasons} onCancel={() => setFlagOpen(false)} onSave={saveFlag} />
      )}
    </div>
  );
}
