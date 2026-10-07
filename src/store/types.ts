import type { Difficulty } from '../engine/config';
import type { Value } from '../engine/value';

/** 풀이 기록 1건. 추가만 하고 수정하지 않는다(append-only) → 기기 간 동기화 시 충돌이 없다. */
export interface Attempt {
  id: string;
  ts: number;
  /** 'all' = 전체 무작위, 그 외 = 유형별 풀기의 typeId */
  mode: string;
  itemId: string;
  source: 'gen' | 'bank';
  typeId: string;
  difficulty: Difficulty;
  seed?: number;
  bankId?: string;
  configVersion: number;
  terms: (Value | null)[];
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
  answer: Value;
  choices: Value[];
  reasons: string[];
  note: string;
}

/** 내보내기/가져오기 파일 형식 (scripts/calibrate.ts의 입력) */
export interface ExportFile {
  app: 'skct-number-series';
  format: 1;
  exportedAt: string;
  attempts: Attempt[];
  flags: Flag[];
}
