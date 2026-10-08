/**
 * 풀이 세션의 점수·콤보·구간 계산 (순수 함수, DOM 없음).
 * 화면은 answer()가 돌려주는 events만 보고 효과(소리·진동·애니메이션)를 낸다.
 *
 * 점수는 정확도가 대부분이고 속도는 상한 있는 보너스다 (원칙: 보상은 실력 향상으로 이어져야 한다).
 *   정답 = (기본 100 + 난이도 보너스 50×(난이도−1) + 속도 보너스 최대 50) × 콤보 배율(1 + 0.1×이전 콤보, 최대 ×2)
 *   오답 = 0점, 콤보 초기화 (감점 없음)
 * ponytail: 수치는 상수. 모드별로 달라져야 하면 config/modes.yaml로 옮긴다 (4단계).
 */

export const CHECKPOINT_EVERY = 10;
const BASE = 100;
const DIFFICULTY_BONUS = 50;
const SPEED_BONUS = 50;
const COMBO_STEP = 0.1;
const COMBO_CAP = 10;

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
  | { kind: 'correct'; gained: number; combo: number; multiplier: number; speedBonus: number }
  | { kind: 'wrong'; lostCombo: number }
  | { kind: 'checkpoint'; index: number; segment: Checkpoint; prev?: Checkpoint };

export const newRun = (): Run => ({ score: 0, combo: 0, maxCombo: 0, solved: 0, correct: 0, checkpoints: [] });

export interface AnswerInput {
  correct: boolean;
  difficulty: number;
  elapsedMs: number;
  /** 속도 보너스가 0이 되는 시간 (실전 문항당 시간) */
  limitMs: number;
}

const sum = (xs: readonly Checkpoint[], key: keyof Checkpoint) => xs.reduce((s, c) => s + c[key], 0);

export function answer(run: Run, a: AnswerInput): { run: Run; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let { score, combo, maxCombo, correct } = run;
  if (a.correct) {
    const multiplier = 1 + COMBO_STEP * Math.min(combo, COMBO_CAP);
    const speedBonus = Math.round(SPEED_BONUS * Math.max(0, 1 - a.elapsedMs / a.limitMs));
    const gained = Math.round((BASE + DIFFICULTY_BONUS * (a.difficulty - 1) + speedBonus) * multiplier);
    score += gained;
    combo += 1;
    correct += 1;
    maxCombo = Math.max(maxCombo, combo);
    events.push({ kind: 'correct', gained, combo, multiplier, speedBonus });
  } else {
    events.push({ kind: 'wrong', lostCombo: combo });
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
