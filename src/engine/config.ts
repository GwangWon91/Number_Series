import { z } from 'zod';
import type { TypePlugin } from './plugin';

/**
 * 설정 파일 스키마 (config/exam.yaml, config/types/*.yaml).
 * 실전 유사도 보정은 원칙적으로 이 스키마 안의 값만 바꿔서 한다.
 */

export const rangeSchema = z
  .tuple([z.number().int(), z.number().int()])
  .refine(([a, b]) => a <= b, { message: '[최소, 최대] 순서여야 합니다' });
export type Range = z.infer<typeof rangeSchema>;

const weight = z.number().nonnegative();
const difficultyKey = z.enum(['1', '2', '3']);
export type Difficulty = 1 | 2 | 3;

export const DISTRACTOR_STRATEGIES = ['near', 'step', 'mistake', 'digit'] as const;
export const QUESTION_KINDS = ['blank', 'pair', 'nth'] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];
export type DistractorStrategy = (typeof DISTRACTOR_STRATEGIES)[number];

export const examSchema = z.object({
  version: z.number().int().positive(),
  exam: z.object({
    choices: z.number().int().min(2).max(6),
    choiceOrder: z.enum(['ascending', 'random']),
    timePerItemSec: z.number().positive(),
    bankRatio: z.number().min(0).max(1),
    difficultyMix: z.partialRecord(difficultyKey, weight),
    avoidRecent: z.number().int().nonnegative(),
    distractors: z.partialRecord(z.enum(DISTRACTOR_STRATEGIES), weight),
    /** 묻는 방식 비중. 없으면 빈칸 1개만 */
    questions: z
      .object({
        kinds: z.partialRecord(z.enum(QUESTION_KINDS), weight),
        pairOps: z.partialRecord(z.enum(['+', '−', '×', '/']), weight),
        /** A·B 문항은 빈칸이 하나 더 있으므로 항을 이만큼 늘린다 */
        pairExtraLength: z.number().int().nonnegative(),
        /** n번째 항 문항: 마지막으로 보이는 항에서 몇 항 뒤를 묻는가 */
        nthAhead: rangeSchema,
      })
      .default({ kinds: { blank: 1 }, pairOps: { '+': 1 }, pairExtraLength: 1, nthAhead: [2, 4] }),
  }),
  validation: z.object({
    minRedundancy: z.number().int().nonnegative(),
    altMinRedundancy: z.number().int().nonnegative(),
    maxRetries: z.number().int().positive(),
    sampleSizePerType: z.number().int().positive(),
    maxDuplicateRate: z.number().min(0).max(1),
    minSuccessRate: z.number().min(0).max(1),
  }),
  feedback: z.object({
    reasons: z.array(z.object({ id: z.string(), label: z.string() })).min(1),
  }),
  changelog: z.array(
    z.object({ version: z.number().int(), date: z.string(), note: z.string() }),
  ),
});
export type ExamConfig = z.infer<typeof examSchema>;

export const typeSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  label: z.string(),
  enabled: z.boolean(),
  weight,
  /** estimated: 추정 / evidence: 기출 근거 있음 / confirmed: 다수 근거로 확정 */
  confidence: z.enum(['estimated', 'evidence', 'confirmed']),
  evidence: z.array(z.string()).default([]),
  note: z.string().optional(),
  /** 빈칸 포함 항 개수 */
  length: rangeSchema,
  blank: z.object({
    last: weight,
    middle: weight,
    /** 가운데 빈칸이 올 수 있는 최소 인덱스 (0부터) */
    minMiddleIndex: z.number().int().min(1).default(3),
  }),
  numbers: z.object({ min: z.number().int(), max: z.number().int() }),
  /** 이 유형만 다른 최소 여유 항을 쓸 때 (군수열 등) */
  minRedundancy: z.number().int().nonnegative().optional(),
  /** 문항 공간이 본래 좁은 유형(등비 등)의 중복률 허용치 덮어쓰기 */
  maxDuplicateRate: z.number().min(0).max(1).optional(),
  display: z.object({ groupSeparator: z.boolean().default(false) }).default({ groupSeparator: false }),
  /** 난이도별 생성 파라미터 — 형태는 유형 플러그인의 params 스키마가 정한다 */
  difficulty: z.partialRecord(difficultyKey, z.unknown()),
});
export type TypeConfigRaw = z.infer<typeof typeSchema>;

export interface TypeConfig extends Omit<TypeConfigRaw, 'difficulty'> {
  difficulty: Partial<Record<Difficulty, unknown>>;
  plugin: TypePlugin;
}

export interface EngineConfig {
  version: number;
  exam: ExamConfig['exam'];
  validation: ExamConfig['validation'];
  feedback: ExamConfig['feedback'];
  changelog: ExamConfig['changelog'];
  types: TypeConfig[];
}

export interface ConfigResult {
  config: EngineConfig | null;
  errors: string[];
  warnings: string[];
}

const issues = (where: string, e: z.ZodError) =>
  e.issues.map((i) => `${where}: ${i.path.join('.') || '(root)'} — ${i.message}`);

/**
 * 원시 YAML 객체들을 검증하고 플러그인과 연결한다.
 * 브라우저(import.meta.glob)와 Node(fs) 양쪽에서 같은 함수를 쓴다.
 */
export function buildConfig(
  examRaw: unknown,
  typeRaws: { file: string; data: unknown }[],
  plugins: readonly TypePlugin[],
): ConfigResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const exam = examSchema.safeParse(examRaw);
  if (!exam.success) errors.push(...issues('exam.yaml', exam.error));

  const pluginById = new Map(plugins.map((p) => [p.id, p]));
  const types: TypeConfig[] = [];
  const seen = new Set<string>();

  for (const { file, data } of typeRaws) {
    const parsed = typeSchema.safeParse(data);
    if (!parsed.success) {
      errors.push(...issues(file, parsed.error));
      continue;
    }
    const t = parsed.data;
    if (seen.has(t.id)) errors.push(`${file}: 중복된 유형 id "${t.id}"`);
    seen.add(t.id);

    const plugin = pluginById.get(t.id);
    if (!plugin) {
      errors.push(`${file}: "${t.id}" 생성기가 src/engine/plugins/index.ts에 등록되지 않았습니다`);
      continue;
    }
    if (t.blank.last + t.blank.middle <= 0) errors.push(`${file}: blank 가중치 합이 0입니다`);
    if (t.numbers.min > t.numbers.max) errors.push(`${file}: numbers.min > numbers.max`);

    const difficulty: Partial<Record<Difficulty, unknown>> = {};
    for (const [key, raw] of Object.entries(t.difficulty)) {
      const p = plugin.params.safeParse(raw);
      if (!p.success) errors.push(...issues(`${file} difficulty.${key}`, p.error));
      else difficulty[Number(key) as Difficulty] = p.data;
    }
    if (Object.keys(difficulty).length === 0) errors.push(`${file}: 난이도 파라미터가 없습니다`);
    if (t.enabled && t.weight === 0) warnings.push(`${file}: enabled인데 weight가 0입니다`);
    types.push({ ...t, difficulty, plugin });
  }

  for (const p of plugins) {
    if (!seen.has(p.id)) errors.push(`생성기 "${p.id}"에 대응하는 config/types/${p.id}.yaml이 없습니다`);
  }
  if (!types.some((t) => t.enabled && t.weight > 0)) errors.push('출제 가능한 유형이 없습니다');

  if (errors.length || !exam.success) return { config: null, errors, warnings };
  const e = exam.data;
  return {
    config: {
      version: e.version,
      exam: e.exam,
      validation: e.validation,
      feedback: e.feedback,
      changelog: e.changelog,
      types,
    },
    errors,
    warnings,
  };
}

export function getType(config: EngineConfig, id: string): TypeConfig {
  const t = config.types.find((x) => x.id === id);
  if (!t) throw new Error(`알 수 없는 유형: ${id}`);
  return t;
}
