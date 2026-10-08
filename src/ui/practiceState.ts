import { readJson, removeKey, writeJson } from '../app/prefs';
import type { Item } from '../engine/item';
import type { Skills } from '../game/adapt';
import type { GameEvent, Run } from '../game/run';

/** 무엇을 풀고 있나: 모드 + (연습이면) 고른 유형 + (약점 모드면) 유형 가중치 */
export interface PlaySpec {
  modeId: string;
  typeId: string | null;
  typeWeights?: Record<string, number>;
}

/** 세션 요약에서 틀린 문제 다시 보기·'실전과 다름' 표시용 */
export interface WrongEntry {
  item: Item;
  attemptId: string;
}

/** 앱을 닫았다 열어도 보던 문항부터 이어지도록 저장하는 진행 상태 */
export interface PracticeState {
  /** 기록에 남기는 모드 이름 (recordMode) — 이어 풀기 판정 키 */
  mode: string;
  spec: PlaySpec;
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
  /** 이 세션에서 틀린 문항 (최근 30개) */
  wrong: WrongEntry[];
  /** 최근 문항 키 (반복 출제 회피) */
  recent: string[];
}

const KEY = 'practice';

/** 다른 모드이거나 모양이 깨진 값(이전 버전·손상)은 버리고 새 문항으로 시작한다 */
export function loadPractice(mode: string): PracticeState | null {
  const s = readJson<Partial<PracticeState>>(KEY, {});
  const ok =
    s.mode === mode &&
    typeof s.spec?.modeId === 'string' &&
    typeof s.sessionId === 'string' &&
    typeof s.run?.score === 'number' &&
    Array.isArray(s.wrong) &&
    s.wrong.every((w) => Array.isArray(w?.item?.terms)) &&
    Array.isArray(s.item?.terms) &&
    Array.isArray(s.item?.choices) &&
    Array.isArray(s.recent) &&
    (s.phase === 'answering' || s.phase === 'revealed');
  return ok ? (s as PracticeState) : null;
}

export function savePractice(s: PracticeState): void {
  writeJson(KEY, s);
}

/** 홈의 '이어 하기' 버튼용: 한 문제 이상 푼 진행 중 세션의 모드 (끝난 뒤 미리 뽑아 둔 문항만 있으면 null) */
export function savedPractice(): { mode: string; spec: PlaySpec } | null {
  const s = readJson<Partial<PracticeState>>(KEY, {});
  return s.mode && s.spec?.modeId && (s.run?.solved ?? 0) > 0 ? { mode: s.mode, spec: s.spec } : null;
}

export function clearPractice(): void {
  removeKey(KEY);
}

/** 유형별 숙련 단계 (적응형 출제). 기기별 편의 값이라 localStorage — 동기화하지 않는다 */
const SKILLS_KEY = 'skills';
export const loadSkills = (): Skills => readJson<Skills>(SKILLS_KEY, {});
export const saveSkills = (s: Skills) => writeJson(SKILLS_KEY, s);
