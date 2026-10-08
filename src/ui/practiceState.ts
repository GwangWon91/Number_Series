import { readJson, removeKey, writeJson } from '../app/prefs';
import type { Item } from '../engine/item';
import type { GameEvent, Run } from '../game/run';

/** 앱을 닫았다 열어도 보던 문항부터 이어지도록 저장하는 진행 상태 */
export interface PracticeState {
  mode: string;
  item: Item;
  phase: 'answering' | 'revealed';
  chosen: number | null;
  elapsedMs: number;
  attemptId: string | null;
  flagged: boolean;
  /** 현재 세션 (나가면 Session으로 저장하고 새로 시작) */
  sessionId: string;
  sessionStart: number;
  /** 세션 점수·콤보·구간 */
  run: Run;
  /** 마지막 답의 이벤트 (정답 공개 화면의 +점수·구간 결과 표시용) */
  events: GameEvent[];
  /** 이 세션에서 틀린 문항 (세션 요약의 다시 보기, 최근 30개) */
  wrong: Item[];
  /** 최근 문항 키 (반복 출제 회피) */
  recent: string[];
}

const KEY = 'practice';

/** 다른 모드이거나 모양이 깨진 값(이전 버전·손상)은 버리고 새 문항으로 시작한다 */
export function loadPractice(mode: string): PracticeState | null {
  const s = readJson<Partial<PracticeState>>(KEY, {});
  const ok =
    s.mode === mode &&
    typeof s.sessionId === 'string' &&
    typeof s.run?.score === 'number' &&
    Array.isArray(s.wrong) &&
    Array.isArray(s.item?.terms) &&
    Array.isArray(s.item?.choices) &&
    Array.isArray(s.recent) &&
    (s.phase === 'answering' || s.phase === 'revealed');
  return ok ? (s as PracticeState) : null;
}

export function savePractice(s: PracticeState): void {
  writeJson(KEY, s);
}

export function savedPracticeMode(): string | null {
  return readJson<Partial<PracticeState>>(KEY, {}).mode ?? null;
}

export function clearPractice(): void {
  removeKey(KEY);
}
