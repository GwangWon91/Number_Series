import { useCallback, useEffect, useRef, useState } from 'react';
import { bank, config } from '../app/engine';
import { loadPrefs, savePrefs } from '../app/prefs';
import { APP_VERSION } from '../app/version';
import { typeLabel } from '../engine/config';
import { itemKey, type Item } from '../engine/item';
import { questionText } from '../engine/question';
import { pickNextItem } from '../engine/session';
import { eqNum, formatValue } from '../engine/value';
import { answer, CHECKPOINT_EVERY, newRun, segmentProgress, type GameEvent } from '../game/run';
import { addAttempt, addFlag, addSession, itemSnapshot, newId } from '../store/records';
import type { Session } from '../store/types';
import { playEffects } from './effects';
import { FlagSheet } from './FlagSheet';
import { loadPractice, savePractice, type PracticeState } from './practiceState';
import { SequenceView, Term } from './SequenceView';
import { Timer } from './Timer';

/** 나가면서 세션 요약 화면에 넘기는 것 */
export interface SessionSummary {
  session: Session;
  wrong: Item[];
}

interface Props {
  /** 'all' 또는 typeId */
  mode: string;
  /** 푼 문제가 있으면 세션 요약과 함께 */
  onExit(summary?: SessionSummary): void;
}

const WRONG_KEEP = 30;
const newSession = () => ({ sessionId: newId(), sessionStart: Date.now(), run: newRun(), wrong: [] as Item[] });

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
    ...(prev ? { sessionId: prev.sessionId, sessionStart: prev.sessionStart, run: prev.run, wrong: prev.wrong } : newSession()),
    events: [],
    recent: [...recent, itemKey(item)].slice(-config.exam.avoidRecent),
  };
}

export function Practice({ mode, onExit }: Props) {
  const [state, setState] = useState<PracticeState>(() => loadPractice(mode) ?? freshState(mode));
  const [pending, setPending] = useState<number | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const [prefs, setPrefs] = useState(loadPrefs);
  const startedAt = useRef(performance.now());
  const { item, phase, run } = state;

  useEffect(() => savePractice(state), [state]);

  const toggleSound = () => {
    const next = { ...loadPrefs(), sound: !prefs.sound };
    savePrefs(next);
    setPrefs(next);
  };

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
        sessionId: state.sessionId,
        ...itemSnapshot(item),
        source: item.source,
        bankId: item.bankId,
        appVersion: APP_VERSION,
        chosen,
        correct,
        elapsedMs,
      });
      const result = answer(state.run, {
        correct,
        difficulty: item.difficulty,
        elapsedMs,
        limitMs: config.exam.timePerItemSec * 1000,
      });
      playEffects(result.events, prefs);
      setPending(null);
      setState((s) => ({
        ...s,
        phase: 'revealed',
        chosen: index,
        elapsedMs,
        attemptId,
        run: result.run,
        events: result.events,
        wrong: correct ? s.wrong : [...s.wrong, s.item].slice(-WRONG_KEEP),
      }));
    },
    [item, mode, prefs, state.phase, state.run, state.sessionId],
  );

  // 나가기 = 세션 종료: 푼 문제가 있으면 기록하고 요약으로. 다음에 들어오면 보던 문항에서 새 세션으로 이어 간다
  const leave = useCallback(() => {
    if (state.run.solved === 0) return onExit();
    const endedAt = Date.now();
    const session: Session = {
      id: state.sessionId,
      ts: state.sessionStart,
      endedAt,
      modeId: mode,
      total: state.run.solved,
      correct: state.run.correct,
      score: state.run.score,
      maxCombo: state.run.maxCombo,
      checkpoints: state.run.checkpoints,
      durationMs: endedAt - state.sessionStart,
      appVersion: APP_VERSION,
      configVersion: config.version,
    };
    void addSession(session);
    // 다음 세션은 새 문항부터 (풀던 문항이면 그대로 이어서)
    const reset = { ...state, ...newSession(), events: [] };
    savePractice(state.phase === 'revealed' ? freshState(mode, reset) : reset);
    onExit({ session, wrong: state.wrong });
  }, [mode, onExit, state]);

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

  // PC 단축키: 1~5 선택, Enter/Space 제출·다음, F 플래그, Esc 나가기
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
        leave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choose, flagOpen, item.choices.length, leave, next, pending, phase, state.flagged, submit]);

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
  // 공개 화면이면 방금 푼 문제까지, 아니면 지금 푸는 문제가 구간의 몇 번째인지
  const inSegment = revealed ? segmentProgress(run) || CHECKPOINT_EVERY : segmentProgress(run) + 1;

  return (
    <div className={`screen practice ${revealed ? 'revealed' : ''}`}>
      <header className="bar-head">
        <button className="icon" onClick={leave} aria-label="나가기">
          ←
        </button>
        <div className="head-title">
          <span>{mode === 'all' ? '전체 무작위' : typeLabel(config, mode)}</span>
          <span className="muted small">
            {run.checkpoints.length + (revealed && segmentProgress(run) === 0 ? 0 : 1)}구간 · {inSegment}/{CHECKPOINT_EVERY}
          </span>
        </div>
        <div className="score" aria-label={`점수 ${run.score}, ${run.solved}문제 중 ${run.correct}문제 정답`}>
          {/* key가 바뀌면 다시 그려져 점수가 오른 순간 한 번 튄다 */}
          <div key={run.score} className={`total ${run.score > 0 && wasCorrect ? 'pop' : ''}`}>
            <b>{run.score.toLocaleString()}</b>
            <span>점수</span>
          </div>
          {run.combo >= 2 ? (
            <div key={`c${run.combo}`} className="combo pop">
              <b>{run.combo}</b>
              <span>콤보</span>
            </div>
          ) : (
            <div className="hit">
              <b>
                {run.correct}/{run.solved}
              </b>
              <span>정답</span>
            </div>
          )}
        </div>
        <button className="icon sound" onClick={toggleSound} aria-label={prefs.sound ? '효과음 끄기' : '효과음 켜기'}>
          {prefs.sound ? '🔊' : '🔇'}
        </button>
        <Timer
          key={item.id + run.solved}
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
              <Gain events={state.events} />
            </p>
            {item.explain.map((line, i) => (
              <p key={i} className={i === 0 ? 'rule-name' : 'rule-line'}>
                {line}
              </p>
            ))}
          </section>
        )}
        {revealed && <CheckpointLine events={state.events} />}
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

/** 정답 공개 줄 끝: 얻은 점수와 콤보 (오답이면 끊긴 콤보) */
function Gain({ events }: { events: GameEvent[] }) {
  const e = events[0];
  if (e?.kind === 'correct') {
    return (
      <span className="gain">
        +{e.gained}
        {e.combo >= 2 && <span className={`combo-tag ${e.combo % 5 === 0 ? 'big' : ''}`}> {e.combo}콤보 ×{e.multiplier.toFixed(1)}</span>}
      </span>
    );
  }
  if (e?.kind === 'wrong' && e.lostCombo >= 3) return <span className="muted small"> · {e.lostCombo}콤보 끊김</span>;
  return null;
}

/** 10문제 구간이 끝난 순간에만: 구간 결과와 지난 구간 비교 (흐름은 막지 않는다) */
function CheckpointLine({ events }: { events: GameEvent[] }) {
  const e = events.find((x) => x.kind === 'checkpoint');
  if (e?.kind !== 'checkpoint') return null;
  const diff = e.prev ? e.segment.score - e.prev.score : null;
  return (
    <p className="checkpoint" aria-live="polite">
      <b>{e.index + 1}구간 끝</b> · {e.segment.correct}/{CHECKPOINT_EVERY} 정답 · {e.segment.score.toLocaleString()}점
      {diff !== null && (
        <span className={diff >= 0 ? 'up' : 'down'}>
          {' '}
          · 지난 구간보다 {diff >= 0 ? '+' : ''}
          {diff.toLocaleString()}
        </span>
      )}
      <span className="muted small block">여기서 멈춰도 좋아요. 나가면 세션 요약을 보여 드려요.</span>
    </p>
  );
}
