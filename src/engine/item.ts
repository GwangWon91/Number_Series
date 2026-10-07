import type { Difficulty } from './config';
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
  /** 빈칸은 null */
  terms: (Value | null)[];
  blankIndex: number;
  answer: Value;
  choices: Value[];
  /** 정답 공개 후 보여 줄 해설 줄 */
  explain: string[];
  /** 군수열 묶음 표시용 */
  groupSize?: number;
}

/** 같은 문항인지 판정하는 키 (유형 + 보이는 수열) */
export function itemKey(item: Pick<Item, 'typeId' | 'terms'>): string {
  return `${item.typeId}|${item.terms.map((t) => (t === null ? '?' : valueKey(t))).join(',')}`;
}
