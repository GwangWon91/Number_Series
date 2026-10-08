import type { Difficulty } from '../engine/config';
import type { Question } from '../engine/question';
import type { Value } from '../engine/value';

/** 풀이 기록 1건. 추가만 하고 수정하지 않는다(append-only) → 기기 간 동기화 시 충돌이 없다. */
export interface Attempt {
  id: string;
  ts: number;
  /** 'all' = 전체 무작위, 그 외 = 유형별 풀기의 typeId */
  mode: string;
  /** 이 풀이가 속한 세션 (Session.id). 2026-10 이전 기록에는 없음 */
  sessionId?: string;
  itemId: string;
  source: 'gen' | 'bank';
  typeId: string;
  difficulty: Difficulty;
  seed?: number;
  bankId?: string;
  configVersion: number;
  /** 풀었을 때의 앱 버전 (v0.2.0 이후 기록부터) */
  appVersion?: string;
  terms: (Value | null)[];
  /** 묻는 방식 (없으면 빈칸 1개). 2026-10 이전 기록에는 없음 */
  question?: Question;
  answer: Value;
  choices: Value[];
  chosen: Value;
  correct: boolean;
  elapsedMs: number;
}

/** '실전과 다름' 표시. 문항 스냅숏을 함께 저장해 설정이 바뀐 뒤에도 그대로 검토할 수 있다. */
export interface Flag {
  id: string;
  ts: number;
  attemptId: string;
  itemId: string;
  typeId: string;
  difficulty: Difficulty;
  seed?: number;
  configVersion: number;
  terms: (Value | null)[];
  question?: Question;
  answer: Value;
  choices: Value[];
  reasons: string[];
  note: string;
}

/** 풀이 세션 1회 (풀기 화면에 들어가서 나갈 때까지). 나갈 때 한 번 저장하고 수정하지 않는다. */
export interface Session {
  id: string;
  /** 시작 시각 */
  ts: number;
  endedAt: number;
  /** 'all' 또는 typeId (Attempt.mode와 같음) */
  modeId: string;
  total: number;
  correct: number;
  /** 시작~종료 경과 시간 (앱을 닫았다 이어 푼 시간 포함) */
  durationMs: number;
  appVersion: string;
  configVersion: number;
}

/** 내보내기/가져오기 파일 형식 (scripts/calibrate.ts의 입력). format 2부터 sessions 포함 */
export interface ExportFile {
  app: 'skct-number-series';
  format: 1 | 2;
  exportedAt: string;
  attempts: Attempt[];
  flags: Flag[];
  sessions?: Session[];
}
