import { readJson, removeKey, writeJson } from '../app/prefs';
import type { Item } from '../engine/item';

/** 앱을 닫았다 열어도 보던 문항부터 이어지도록 저장하는 진행 상태 */
export interface PracticeState {
  mode: string;
  item: Item;
  phase: 'answering' | 'revealed';
  chosen: number | null;
  elapsedMs: number;
  attemptId: string | null;
  flagged: boolean;
  solved: number;
  correct: number;
  /** 최근 문항 키 (반복 출제 회피) */
  recent: string[];
}

const KEY = 'practice';

/** 다른 모드이거나 모양이 깨진 값(이전 버전·손상)은 버리고 새 문항으로 시작한다 */
export function loadPractice(mode: string): PracticeState | null {
  const s = readJson<Partial<PracticeState>>(KEY, {});
  const ok =
    s.mode === mode &&
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
