import type { Difficulty } from './config';
import type { Question } from './question';
import { valueKey, type Value } from './value';

/** 화면에 출제되는 문항 1개. 자동 생성·문제은행 모두 이 형태로 통일한다. */
export interface Item {
  /** gen:<type>:<difficulty>:<seed> 또는 bank:<bankId> */
  id: string;
  source: 'gen' | 'bank';
  typeId: string;
  difficulty: Difficulty;
  /** 자동 생성 문항 재현용 (같은 seed + 같은 configVersion → 같은 문항) */
  seed?: number;
  bankId?: string;
  configVersion: number;
  /** 빈칸은 null (pair면 A·B 두 칸, nth면 없음) */
  terms: (Value | null)[];
  /** 빈칸 위치 (pair는 A, nth는 묻는 항 n−1) */
  blankIndex: number;
  /** 묻는 방식. 없으면 빈칸 1개 */
  question?: Question;
  /** 묻는 값: 빈칸 값 / A○B / n번째 항 */
  answer: Value;
  choices: Value[];
  /** 정답 공개 후 보여 줄 해설 줄 */
  explain: string[];
  /** 군수열 묶음 표시용 */
  groupSize?: number;
}

/** 같은 문항인지 판정하는 키 (유형 + 보이는 수열) */
export function itemKey(item: Pick<Item, 'typeId' | 'terms' | 'question'>): string {
  const q = item.question ? `|${item.question.kind === 'pair' ? item.question.op : `n${item.question.n}`}` : '';
  return `${item.typeId}|${item.terms.map((t) => (t === null ? '?' : valueKey(t))).join(',')}${q}`;
}
