import { z } from 'zod';
import type { Difficulty, EngineConfig } from './config';
import { minRedundancyOf } from './compose';
import type { Item } from './item';
import { analyze, judge } from './solver';
import { eqValue, parseValue, valueKey, type Value } from './value';

/**
 * 정적 문제은행.
 *  - data/bank/public/*.yaml  : 직접 만든·변형 문항. 앱에 포함되어 출제된다 (리포 공개).
 *  - data/bank/private/*.yaml : 실제 기출 복원 문항. gitignore 대상. 로컬 비교·보정 스크립트에서만 쓴다.
 */

const rawValue = z.union([z.number().int(), z.string()]);

export const bankEntrySchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]+$/),
  /** 빈칸은 null. 분수는 "3/4" */
  terms: z.array(z.union([rawValue, z.null()])).min(3),
  choices: z.array(rawValue).min(2),
  answer: rawValue,
  /** 알면 적는다. 모르면 비워 두면 solver가 판별을 시도한다 */
  typeId: z.string().optional(),
  /** 사람이 쓴 규칙 설명 (해설 첫 줄로 쓰인다) */
  rule: z.string(),
  difficulty: z.number().int().min(1).max(3).optional(),
  source: z.object({
    kind: z.enum(['recall', 'community', 'book', 'original', 'variant']),
    round: z.string().optional(),
    note: z.string().optional(),
  }),
  /** 공개 리포에 올려도 되는가. private 원문은 false */
  publishable: z.boolean(),
});

export type Visibility = 'public' | 'private';

export interface BankEntry {
  id: string;
  terms: (Value | null)[];
  choices: Value[];
  answer: Value;
  typeId?: string;
  rule: string;
  difficulty?: Difficulty;
  source: z.infer<typeof bankEntrySchema>['source'];
  publishable: boolean;
  visibility: Visibility;
  file: string;
}

export function parseBankFile(
  raw: unknown,
  file: string,
  visibility: Visibility,
): { entries: BankEntry[]; errors: string[] } {
  const errors: string[] = [];
  const entries: BankEntry[] = [];
  if (raw === null || raw === undefined) return { entries, errors };
  if (!Array.isArray(raw)) return { entries, errors: [`${file}: 최상위는 문항 배열이어야 합니다`] };
  raw.forEach((r, i) => {
    const p = bankEntrySchema.safeParse(r);
    if (!p.success) {
      errors.push(...p.error.issues.map((x) => `${file}[${i}]: ${x.path.join('.')} — ${x.message}`));
      return;
    }
    try {
      const e = p.data;
      entries.push({
        ...e,
        terms: e.terms.map((t) => (t === null ? null : parseValue(t))),
        choices: e.choices.map(parseValue),
        answer: parseValue(e.answer),
        difficulty: e.difficulty as Difficulty | undefined,
        visibility,
        file,
      });
    } catch (err) {
      errors.push(`${file}[${i}]: ${(err as Error).message}`);
    }
  });
  return { entries, errors };
}

export interface BankCheck {
  errors: string[];
  warnings: string[];
  /** 정답을 설명하는 규칙 계열 id (solver 판별 결과) */
  families: string[];
}

/** 은행 문항 검사. 실전 문항은 solver가 모호하다고 판단해도 경고만 한다. */
export function checkBankEntry(entry: BankEntry, config: EngineConfig): BankCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const where = `${entry.file} ${entry.id}`;

  const blanks = entry.terms.filter((t) => t === null).length;
  if (blanks !== 1) errors.push(`${where}: 빈칸(null)은 정확히 1개여야 합니다 (현재 ${blanks}개)`);
  if (!entry.choices.some((c) => eqValue(c, entry.answer))) errors.push(`${where}: 정답이 선택지에 없습니다`);
  if (new Set(entry.choices.map(valueKey)).size !== entry.choices.length) errors.push(`${where}: 선택지가 중복됩니다`);
  if (entry.visibility === 'public' && !entry.publishable) {
    errors.push(`${where}: publishable: false 문항이 public 은행에 있습니다 — data/bank/private/로 옮기세요`);
  }
  if (entry.choices.length !== config.exam.choices) {
    warnings.push(`${where}: 선택지 ${entry.choices.length}개 (설정은 ${config.exam.choices}개)`);
  }
  if (entry.typeId && !config.types.some((t) => t.id === entry.typeId)) {
    warnings.push(`${where}: 알 수 없는 typeId "${entry.typeId}" — 새 유형 후보`);
  }
  if (errors.length) return { errors, warnings, families: [] };

  const type = config.types.find((t) => t.id === entry.typeId);
  const minRed = type ? minRedundancyOf(config, type) : config.validation.minRedundancy;
  const verdict = judge(
    analyze(entry.terms, entry.choices),
    entry.answer,
    0,
    config.validation.altMinRedundancy,
  );
  const families = [...new Set(verdict.supporting.map((e) => e.familyId))];
  if (!families.length) warnings.push(`${where}: 등록된 규칙으로 정답을 설명하지 못함 — 새 규칙 계열 후보`);
  else if (!verdict.supporting.some((e) => e.redundancy >= minRed)) {
    warnings.push(`${where}: 정답 규칙의 여유 항이 ${minRed} 미만 (항이 적음)`);
  }
  for (const alt of verdict.alternatives) {
    warnings.push(`${where}: 다른 해석 [${alt.familyId}] → ${valueKey(alt.value)}`);
  }
  return { errors, warnings, families };
}

export function bankToItem(entry: BankEntry, config: EngineConfig): Item {
  const blankIndex = entry.terms.indexOf(null);
  const verdict = judge(analyze(entry.terms, entry.choices), entry.answer, 0, Infinity);
  const best = verdict.supporting.sort((a, b) => b.redundancy - a.redundancy)[0];
  return {
    id: `bank:${entry.id}`,
    source: 'bank',
    typeId: entry.typeId ?? best?.familyId ?? 'unknown',
    difficulty: entry.difficulty ?? 2,
    bankId: entry.id,
    configVersion: config.version,
    terms: entry.terms,
    blankIndex,
    answer: entry.answer,
    choices: entry.choices,
    explain: [entry.rule, ...(best ? best.explain : [])],
  };
}
