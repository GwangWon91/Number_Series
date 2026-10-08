import { useCallback, useEffect, useRef, useState } from 'react';
import { bank, config, modes } from '../app/engine';
import { loadPrefs, savePrefs } from '../app/prefs';
import { APP_VERSION } from '../app/version';
import { typeLabel } from '../engine/config';
import { itemKey } from '../engine/item';
import { questionText } from '../engine/question';
import { pickNextItem } from '../engine/session';
import { eqNum, formatValue } from '../engine/value';
import { skillOf, updateSkill } from '../game/adapt';
import { recordMode, type Mode } from '../game/modes';
import { answer, CHECKPOINT_EVERY, newRun, segmentProgress, type GameEvent, type Run } from '../game/run';
import { addAttempt, addFlag, addSession, itemSnapshot, newId } from '../store/records';
import type { Session } from '../store/types';
import { playEffects } from './effects';
import { FlagSheet } from './FlagSheet';
import {
  loadPractice,
  loadSkills,
  savePractice,
  saveSkills,
  type PlaySpec,
  type PracticeState,
  type WrongEntry,
} from './practiceState';
import { SequenceView, Term } from './SequenceView';
import { Timer } from './Timer';

/** 나가면서 세션 요약 화면에 넘기는 것 */
export interface SessionSummary {
  session: Session;
  wrong: WrongEntry[];
  title: string;
  spec: PlaySpec;
}

interface Props {
  spec: PlaySpec;
  /** 푼 문제가 있으면 세션 요약과 함께 */
  onExit(summary?: SessionSummary): void;
}

const WRONG_KEEP = 30;
const newSession = () => ({ sessionId: newId(), sessionStart: Date.now(), run: newRun(), wrong: [] as WrongEntry[] });

export const modeOf = (spec: PlaySpec): Mode => modes.modes.find((m) => m.id === spec.modeId) ?? modes.modes[0];
const isDefault = (mode: Mode) => mode.id === modes.modes[0].id;
export const playTitle = (spec: PlaySpec) => {
  const mode = modeOf(spec);
  return spec.typeId ? typeLabel(config, spec.typeId) : isDefault(mode) ? '전체 무작위' : mode.label;
};

function freshState(spec: PlaySpec, prev?: PracticeState): PracticeState {
  const mode = modeOf(spec);
  const recent = prev?.recent ?? [];
  const skills = mode.adaptive ? loadSkills() : null;
  const item = pickNextItem(config, bank, {
    typeId: spec.typeId,
    recentKeys: new Set(recent),
    typeWeights: spec.typeWeights,
    levelOf: skills ? (t) => skillOf(skills, t).level : undefined,
    bankRatio: mode.bankRatio,
  });
  return {
    mode: recordMode(mode, isDefault(mode), spec.typeId),
    spec,
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

/** 모드가 정한 끝 조건 (문항 수·목숨·시간) */
function isOver(mode: Mode, run: Run, sessionStart: number): boolean {
  return (
    (mode.items !== undefined && run.solved >= mode.items) ||
    (mode.lives !== undefined && run.solved - run.correct >= mode.lives) ||
    (mode.timeLimitSec !== undefined && Date.now() - sessionStart >= mode.timeLimitSec * 1000)
  );
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function Practice({ spec, onExit }: Props) {
  const mode = modeOf(spec);
  // 제한 시간이 지난 세션도 그대로 불러온다 → 아래 타이머가 바로 끝내고 기록한다
  const [state, setState] = useState<PracticeState>(
    () => loadPractice(recordMode(mode, isDefault(mode), spec.typeId)) ?? freshState(spec),
  );
  const [pending, setPending] = useState<number | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flash, setFlash] = useState<'ok' | 'ng' | null>(null);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [now, setNow] = useState(Date.now);
  const startedAt = useRef(performance.now());
  const { item, phase, run } = state;

  useEffect(() => savePractice(state), [state]);

  const toggleSound = () => {
    const next = { ...loadPrefs(), sound: !prefs.sound };
    savePrefs(next);
    setPrefs(next);
  };

  /** 세션 종료: 푼 문제가 있으면 기록하고 요약으로. 다음에 들어오면 새 세션 */
  const finish = useCallback(
    (s: PracticeState) => {
      if (s.run.solved === 0) return onExit();
      const endedAt = Date.now();
      const session: Session = {
        id: s.sessionId,
        ts: s.sessionStart,
        endedAt,
        modeId: s.mode,
        total: s.run.solved,
        correct: s.run.correct,
        score: s.run.score,
        maxCombo: s.run.maxCombo,
        checkpoints: s.run.checkpoints,
        durationMs: endedAt - s.sessionStart,
        appVersion: APP_VERSION,
        configVersion: config.version,
      };
      void addSession(session);
      // 다음 세션은 새 문항부터 (풀던 문항이면 그대로 이어서). 끝이 정해진 모드는 처음부터
      const reset = { ...s, ...newSession(), events: [] };
      savePractice(s.phase === 'revealed' || isOver(mode, s.run, s.sessionStart) ? freshState(spec, reset) : reset);
      onExit({ session, wrong: s.wrong, title: playTitle(spec), spec });
    },
    [mode, onExit, spec],
  );
  const leave = useCallback(() => finish(state), [finish, state]);

  // 제한 시간 모드: 남은 시간 표시, 다 되면 끝
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    if (!mode.timeLimitSec) return;
    const id = window.setInterval(() => {
      setNow(Date.now());
      if (isOver(mode, stateRef.current.run, stateRef.current.sessionStart)) finish(stateRef.current);
    }, 250);
    return () => window.clearInterval(id);
  }, [finish, mode]);

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
        mode: state.mode,
        sessionId: state.sessionId,
        ...itemSnapshot(item),
        source: item.source,
        bankId: item.bankId,
        appVersion: APP_VERSION,
        chosen,
        correct,
        elapsedMs,
      });
      if (mode.adaptive && item.source === 'gen') {
        const skills = loadSkills();
        saveSkills({ ...skills, [item.typeId]: updateSkill(skillOf(skills, item.typeId), correct) });
      }
      const result = answer(state.run, {
        correct,
        difficulty: item.difficulty,
        elapsedMs,
        limitMs: config.exam.timePerItemSec * 1000,
      });
      // 실전(end)은 끝날 때까지 맞았는지 알려 주지 않는다
      if (mode.feedback !== 'end') playEffects(result.events, prefs);
      setPending(null);
      const answered: PracticeState = {
        ...state,
        phase: 'revealed',
        chosen: index,
        elapsedMs,
        attemptId,
        run: result.run,
        events: result.events,
        wrong: correct ? state.wrong : [...state.wrong, { item, attemptId }].slice(-WRONG_KEEP),
      };
      if (mode.feedback === 'each') return setState(answered);
      // instant·end: 공개 화면 없이 바로 다음 문제 (또는 끝)
      if (isOver(mode, answered.run, answered.sessionStart)) return finish(answered);
      if (mode.feedback === 'instant') {
        setFlash(correct ? 'ok' : 'ng');
        window.setTimeout(() => setFlash(null), 350);
      }
      startedAt.current = performance.now();
      setState(freshState(spec, answered));
    },
    [finish, item, mode, prefs, spec, state],
  );

  const choose = useCallback(
    (index: number) => {
      if (phase !== 'answering') return;
      if (!prefs.confirmBeforeSubmit || pending === index) submit(index);
      else setPending(index);
    },
    [phase, pending, prefs.confirmBeforeSubmit, submit],
  );

  const over = phase === 'revealed' && isOver(mode, run, state.sessionStart);
  const next = useCallback(() => {
    if (over) return finish(state);
    setFlagOpen(false);
    setPending(null);
    startedAt.current = performance.now();
    setState((s) => freshState(spec, s));
  }, [finish, over, spec, state]);

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
    await addFlag({ id: newId(), ts: Date.now(), attemptId: state.attemptId, ...itemSnapshot(item), reasons, note });
    setState((s) => ({ ...s, flagged: true }));
    setFlagOpen(false);
  };

  const revealed = phase === 'revealed';
  const wasCorrect = revealed && state.chosen !== null && eqNum(item.choices[state.chosen], item.answer);
  const hidden = mode.feedback === 'end';
  const remaining = mode.timeLimitSec ? mode.timeLimitSec * 1000 - (now - state.sessionStart) : null;

  return (
    <div className={`screen practice ${revealed ? 'revealed' : ''}`}>
      <header className="bar-head">
        <button className="icon" onClick={leave} aria-label="나가기">
          ←
        </button>
        <div className="head-title">
          <span>{playTitle(spec)}</span>
          <span className="muted small">
            <Progress mode={mode} run={run} revealed={revealed} />
          </span>
        </div>
        {!hidden && (
          <div className="score" aria-label={`점수 ${run.score}, ${run.solved}문제 중 ${run.correct}문제 정답`}>
            {/* key가 바뀌면 다시 그려져 점수가 오른 순간 한 번 튄다 */}
            <div key={run.score} className={`total ${run.score > 0 && (wasCorrect || flash === 'ok') ? 'pop' : ''}`}>
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
        )}
        {!hidden && (
          <button className="icon sound" onClick={toggleSound} aria-label={prefs.sound ? '효과음 끄기' : '효과음 켜기'}>
            {prefs.sound ? '🔊' : '🔇'}
          </button>
        )}
        {remaining !== null ? (
          <div className={`countdown ${remaining < 10_000 ? 'low' : ''}`} aria-label="남은 시간">
            {clock(remaining)}
          </div>
        ) : (
          <Timer
            key={item.id + run.solved}
            limitSec={config.exam.timePerItemSec}
            running={!revealed}
            frozenMs={revealed ? state.elapsedMs : undefined}
          />
        )}
      </header>

      <main className={`stage ${flash ? `flash-${flash}` : ''}`}>
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
            <button
              className="link small flag"
              disabled={state.flagged}
              onClick={() => setFlagOpen(true)}
              title="실전과 다른 점 표시 (F)"
            >
              {state.flagged ? '실전과 다름 표시함' : '실전과 다른가요?'}
            </button>
          </section>
        )}
        {revealed && mode.items === undefined && <CheckpointLine events={state.events} />}
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
            <button className="primary wide" onClick={next} autoFocus>
              {over ? '결과 보기' : '다음'}
            </button>
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

/** 머리말 둘째 줄: 문항 수가 정해진 모드는 n/N, 목숨 모드는 ♥, 끝없는 모드는 10문제 구간 */
function Progress({ mode, run, revealed }: { mode: Mode; run: Run; revealed: boolean }) {
  if (mode.items) return <>{Math.min(run.solved + (revealed ? 0 : 1), mode.items)}/{mode.items}문제</>;
  if (mode.lives) {
    const left = Math.max(0, mode.lives - (run.solved - run.correct));
    return (
      <span className="lives" aria-label={`목숨 ${left}개`}>
        {'♥'.repeat(left)}
        {'♡'.repeat(mode.lives - left)}
      </span>
    );
  }
  if (mode.timeLimitSec) return <>{run.solved}문제</>;
  // 공개 화면이면 방금 푼 문제까지, 아니면 지금 푸는 문제가 구간의 몇 번째인지
  const done = revealed && segmentProgress(run) === 0;
  return (
    <>
      {run.checkpoints.length + (done ? 0 : 1)}구간 · {done ? CHECKPOINT_EVERY : segmentProgress(run) + (revealed ? 0 : 1)}/
      {CHECKPOINT_EVERY}
    </>
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
