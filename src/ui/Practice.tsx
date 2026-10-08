import { Check, ChevronLeft, Flag, Heart, Volume2, VolumeX } from 'lucide-react';
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
import { answer, CHECKPOINT_EVERY, newRun, SCORE_VERSION, segmentProgress, type GameEvent, type Run } from '../game/run';
import { addAttempt, addFlag, addSession, itemSnapshot, newId } from '../store/records';
import type { Session } from '../store/types';
import { playEffects } from './effects';
import { FlagSheet } from './FlagSheet';
import { ExplainLines, IconButton } from './parts';
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
  return spec.typeId ? typeLabel(config, spec.typeId) : mode.label;
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
        // 점수 없는 모드(무제한 연습)는 점수를 남기지 않는다
        ...(mode.scoring ? { score: s.run.score, scoreVersion: SCORE_VERSION } : {}),
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
      const result = answer(state.run, { correct, difficulty: item.difficulty, elapsedMs }, mode.scoring);
      // 실전(end)은 끝날 때까지 맞았는지 알려 주지 않는다
      if (mode.feedback !== 'end') playEffects(result.events, prefs);
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

  const over = phase === 'revealed' && isOver(mode, run, state.sessionStart);
  const next = useCallback(() => {
    if (over) return finish(state);
    setFlagOpen(false);
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
        submit(n - 1);
      } else if ((e.key === 'Enter' || e.key === ' ') && phase === 'revealed') {
        e.preventDefault();
        next();
      } else if ((e.key === 'f' || e.key === 'F') && phase === 'revealed' && !state.flagged) {
        setFlagOpen(true);
      } else if (e.key === 'Escape') {
        leave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flagOpen, item.choices.length, leave, next, phase, state.flagged, submit]);

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

  const scored = mode.scoring !== undefined;

  return (
    <div className={`screen practice ${revealed ? 'revealed' : ''}`}>
      <header className="topbar">
        <IconButton label="나가기" onClick={leave}>
          <ChevronLeft aria-hidden />
        </IconButton>
        <div className="topbar-title">
          <h1>{playTitle(spec)}</h1>
          <span className="topbar-sub">
            <Progress mode={mode} run={run} revealed={revealed} />
          </span>
        </div>
        {!hidden && (
          <div className="hud" aria-label={scored ? `점수 ${run.score}` : `${run.solved}문제 중 ${run.correct}문제 정답`}>
            {run.combo >= 2 && (
              // key가 바뀌면 다시 그려져 콤보가 오른 순간 한 번 튄다
              <span key={`c${run.combo}`} className="chip combo pop">
                {run.combo}연속
              </span>
            )}
            {scored && (
              <span key={run.score} className={`hud-score ${run.score > 0 && (wasCorrect || flash === 'ok') ? 'pop' : ''}`}>
                <b>{run.score.toLocaleString()}</b>
                <span>점</span>
              </span>
            )}
          </div>
        )}
        {!hidden && (
          <IconButton label={prefs.sound ? '효과음 끄기' : '효과음 켜기'} onClick={toggleSound}>
            {prefs.sound ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />}
          </IconButton>
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

      <main className="stage">
        {/* 타임어택: 판정은 이 카드의 테두리 색으로만 잠깐 (화면 전체 번쩍임 없음) */}
        <section className={`q-card ${flash ? `flash-${flash}` : ''}`} aria-label="문제">
          <p className="prompt">{questionText(item.question)}</p>
          <SequenceView
            item={item}
            revealed={revealed}
            correct={wasCorrect}
            groupSeparator={item.groupSize !== undefined}
          />
        </section>
        {revealed && (
          <section className={`explain ${wasCorrect ? 'ok' : 'ng'}`} aria-live="polite">
            <p className="verdict">
              {wasCorrect ? '맞았어요' : '틀렸어요. 정답은'} <b><Term v={item.answer} /></b>
              <span className="muted"> {(state.elapsedMs / 1000).toFixed(0)}초</span>
              {item.source === 'bank' && <span className="muted"> · 문제은행</span>}
              <Gain events={state.events} scored={scored} />
            </p>
            <ExplainLines item={item} />
            <ol className="answer-row" aria-label="선택지">
              {item.choices.map((c, i) => {
                const isAnswer = eqNum(c, item.answer);
                const cls = isAnswer ? 'answer' : i === state.chosen ? 'wrong' : '';
                return (
                  <li key={i} className={cls}>
                    {isAnswer && <Check aria-label="정답" />}
                    <Term v={c} />
                  </li>
                );
              })}
            </ol>
            <button className="text-button flag" disabled={state.flagged} onClick={() => setFlagOpen(true)} title="실전과 다른 점 표시 (F)">
              <Flag aria-hidden />
              {state.flagged ? '실전과 다름 표시함' : '실전과 다른가요?'}
            </button>
          </section>
        )}
        {revealed && mode.items === undefined && <CheckpointLine events={state.events} scored={scored} />}
      </main>

      {/* 하단 고정 바: 답할 때는 선택지, 공개 후에는 [다음] — 위치가 문제마다 바뀌지 않는다 */}
      <footer className="dock">
        {revealed ? (
          <button className="button primary block" onClick={next} autoFocus>
            {over ? '결과 보기' : '다음'}
          </button>
        ) : (
          <ol className="choices">
            {item.choices.map((c, i) => (
              <li key={i}>
                <button className="choice" onClick={() => submit(i)} aria-label={`${i + 1}번 ${formatValue(c)}`}>
                  <span className="num" aria-hidden>
                    {i + 1}
                  </span>
                  <span className="val">
                    <Term v={c} />
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </footer>

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
      <span className="lives" role="img" aria-label={`목숨 ${left}개`}>
        {Array.from({ length: mode.lives }, (_, i) => (
          <Heart key={i} aria-hidden className={i < left ? 'on' : ''} />
        ))}
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

/** 정답 공개 줄 끝: 얻은 점수(점수 모드)와 콤보 (오답이면 감점·끊긴 콤보) */
function Gain({ events, scored }: { events: GameEvent[]; scored: boolean }) {
  const e = events[0];
  if (e?.kind === 'correct') {
    const parts = [e.comboBonus && `콤보 +${e.comboBonus}`, e.speedBonus && `속도 +${e.speedBonus}`].filter(Boolean);
    return (
      <span className="gain">
        {scored ? ` +${e.gained}` : ''}
        {scored && parts.length > 0 && <span className="gain-detail"> ({parts.join(' · ')})</span>}
        {!scored && e.combo >= 2 && <span className="gain-detail"> · {e.combo}연속</span>}
      </span>
    );
  }
  if (e?.kind === 'wrong') {
    const bits = [scored && e.lost > 0 && `−${e.lost}점`, e.lostCombo >= 3 && `${e.lostCombo}연속 끊김`].filter(Boolean);
    return bits.length ? <span className="muted"> · {bits.join(' · ')}</span> : null;
  }
  return null;
}

/** 10문제 구간이 끝난 순간에만: 구간 결과와 지난 구간 비교 (흐름은 막지 않는다) */
function CheckpointLine({ events, scored }: { events: GameEvent[]; scored: boolean }) {
  const e = events.find((x) => x.kind === 'checkpoint');
  if (e?.kind !== 'checkpoint') return null;
  // 점수 없는 모드는 정답 수로 비교
  const key = scored ? 'score' : 'correct';
  const diff = e.prev ? e.segment[key] - e.prev[key] : null;
  return (
    <p className="checkpoint" aria-live="polite">
      <b>{e.index + 1}구간 끝</b> · {e.segment.correct}/{CHECKPOINT_EVERY} 정답
      {scored && ` · ${e.segment.score.toLocaleString()}점`}
      {diff !== null && (
        <span className={diff >= 0 ? 'up' : 'down'}>
          {' '}
          · 지난 구간보다 {diff >= 0 ? '+' : ''}
          {diff.toLocaleString()}
          {scored ? '점' : '개'}
        </span>
      )}
      <span className="hint block">여기서 멈춰도 좋아요. 나가면 세션 요약을 보여 드려요.</span>
    </p>
  );
}
