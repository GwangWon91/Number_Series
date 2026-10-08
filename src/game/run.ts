/**
 * 풀이 세션의 점수·콤보·구간 계산 (순수 함수, DOM 없음).
 * 화면은 answer()가 돌려주는 events만 보고 효과(소리·진동·애니메이션)를 낸다.
 *
 * 점수 기준은 모드마다 config/modes.yaml의 scoring. 없으면(무제한 연습) 점수 0 —
 * 콤보·구간은 그대로 센다 (효과음·업적·구간 요약용).
 */
import type { Scoring } from './modes';

export const CHECKPOINT_EVERY = 10;
/**
 * 점수 체계 버전. 최고 기록은 같은 버전끼리만 비교한다.
 * v1: v0.8 이전의 큰 점수 · v2: 모드별 scoring (v0.9.0) · v3: 실전 = 정답 1점·20점 만점
 */
export const SCORE_VERSION = 3;

/** 10문제 구간 하나의 결과 */
export interface Checkpoint {
  correct: number;
  score: number;
}

export interface Run {
  score: number;
  /** 지금 이어지고 있는 연속 정답 수 */
  combo: number;
  maxCombo: number;
  solved: number;
  correct: number;
  /** 끝난 구간들 (CHECKPOINT_EVERY 문제마다 하나) */
  checkpoints: Checkpoint[];
}

export type GameEvent =
  | { kind: 'correct'; gained: number; combo: number; speedBonus: number; comboBonus: number }
  | { kind: 'wrong'; lostCombo: number; lost: number }
  | { kind: 'checkpoint'; index: number; segment: Checkpoint; prev?: Checkpoint };

export const newRun = (): Run => ({ score: 0, combo: 0, maxCombo: 0, solved: 0, correct: 0, checkpoints: [] });

export interface AnswerInput {
  correct: boolean;
  difficulty: number;
  elapsedMs: number;
}

const sum = (xs: readonly Checkpoint[], key: keyof Checkpoint) => xs.reduce((s, c) => s + c[key], 0);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function answer(run: Run, a: AnswerInput, scoring?: Scoring): { run: Run; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let { score, combo, maxCombo, correct } = run;
  if (a.correct) {
    combo += 1;
    correct += 1;
    maxCombo = Math.max(maxCombo, combo);
    let speedBonus = 0;
    let comboBonus = 0;
    let gained = 0;
    if (scoring) {
      const sec = a.elapsedMs / 1000;
      const sp = scoring.speed;
      speedBonus = sp ? Math.round(sp.max * clamp01((sp.zeroSec - sec) / (sp.zeroSec - sp.fullSec))) : 0;
      comboBonus = scoring.combo ? Math.min((combo - 1) * scoring.combo.step, scoring.combo.cap) : 0;
      gained = scoring.correct + scoring.difficulty * (a.difficulty - 1) + speedBonus + comboBonus;
    }
    score += gained;
    events.push({ kind: 'correct', gained, combo, speedBonus, comboBonus });
  } else {
    const next = Math.max(0, score + (scoring?.wrong ?? 0));
    events.push({ kind: 'wrong', lostCombo: combo, lost: score - next });
    score = next;
    combo = 0;
  }
  const solved = run.solved + 1;
  let checkpoints = run.checkpoints;
  if (solved % CHECKPOINT_EVERY === 0) {
    const segment = { correct: correct - sum(checkpoints, 'correct'), score: score - sum(checkpoints, 'score') };
    events.push({ kind: 'checkpoint', index: checkpoints.length, segment, prev: checkpoints.at(-1) });
    checkpoints = [...checkpoints, segment];
  }
  return { run: { score, combo, maxCombo, solved, correct, checkpoints }, events };
}

/** 지금 진행 중인(아직 안 끝난) 구간의 푼 수 — 구간 진행 표시용 */
export const segmentProgress = (run: Run) => run.solved % CHECKPOINT_EVERY;
