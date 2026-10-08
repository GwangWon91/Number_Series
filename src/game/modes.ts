import { z } from 'zod';

/**
 * 게임 모드 (config/modes.yaml). 새 모드 = YAML 항목 하나, 코드 수정 없음.
 * 모드는 "몇 문제·몇 초·목숨 몇 개·정답을 언제 보여 주나·어떤 문항을 내나"의 조합이다.
 * 문항 생성 결과(seed 재현)는 바꾸지 않으므로 exam.yaml의 version과 별개로 자체 version을 둔다.
 */
/**
 * 점수 기준 (모드별). 없으면 점수를 매기지 않는다 (무제한 연습).
 * 정답 = correct + difficulty×(난이도−1) + 속도 보너스 + 콤보 보너스, 오답 = wrong(0 이하). 세션 점수는 0 아래로 안 내려간다.
 */
export const scoringSchema = z.object({
  correct: z.number().nonnegative(),
  /** 난이도 1을 넘는 단계마다 더하는 점수 */
  difficulty: z.number().nonnegative().default(0),
  /** fullSec 안에 풀면 max, zeroSec부터 0 (그 사이 선형) */
  speed: z
    .object({ max: z.number().nonnegative(), fullSec: z.number().nonnegative(), zeroSec: z.number().positive() })
    .refine((s) => s.fullSec < s.zeroSec, { message: 'fullSec < zeroSec' })
    .optional(),
  /** 연속 정답 2번째부터 step씩, 최대 cap */
  combo: z.object({ step: z.number().nonnegative(), cap: z.number().nonnegative() }).optional(),
  /** 오답 감점 (0 이하) */
  wrong: z.number().max(0).default(0),
});
export type Scoring = z.infer<typeof scoringSchema>;

export const modeSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  label: z.string(),
  description: z.string(),
  /** 문항 수. 없으면 끝없이 */
  items: z.number().int().positive().optional(),
  /** 세션 제한 시간(초). 다 되면 끝 */
  timeLimitSec: z.number().positive().optional(),
  /** 틀릴 수 있는 횟수. 다 쓰면 끝 */
  lives: z.number().int().positive().optional(),
  /**
   * each: 문제마다 정답·해설 공개 → [다음]
   * instant: 효과음·진동만 내고 바로 다음 문제 (해설은 세션 요약에서)
   * end: 끝날 때까지 정답을 숨김 (실전)
   */
  feedback: z.enum(['each', 'instant', 'end']),
  /** 유형별 실력에 맞춰 난이도를 올리고 내린다 */
  adaptive: z.boolean().default(false),
  /** 문제은행 출제 비율. 없으면 exam.yaml의 exam.bankRatio */
  bankRatio: z.number().min(0).max(1).optional(),
  /** weak: 내 기록에서 틀린 비율이 높은 유형 위주 */
  pool: z.enum(['all', 'weak']).default('all'),
  /** 유형을 골라 풀 수 있다 (홈의 '유형 골라 연습' 표시 플래그) */
  typeSelect: z.boolean().default(false),
  scoring: scoringSchema.optional(),
});
export type Mode = z.infer<typeof modeSchema>;

export const modesFileSchema = z
  .object({
    version: z.number().int().positive(),
    modes: z.array(modeSchema).min(1),
  })
  .refine((f) => new Set(f.modes.map((m) => m.id)).size === f.modes.length, { message: '모드 id가 중복됩니다' })
  .refine((f) => f.modes.every((m) => m.items || m.timeLimitSec || m.lives || m.feedback === 'each'), {
    message: '끝나는 조건(items·timeLimitSec·lives)이 없는 모드는 feedback: each여야 합니다 (나가기로만 끝남)',
  });
export type ModesFile = z.infer<typeof modesFileSchema>;

/** 첫 번째 모드가 기본(홈의 [풀기]) */
export function parseModes(raw: unknown): { modes: ModesFile | null; errors: string[] } {
  const r = modesFileSchema.safeParse(raw);
  if (r.success) return { modes: r.data, errors: [] };
  return { modes: null, errors: r.error.issues.map((i) => `modes.yaml: ${i.path.join('.') || '(root)'} — ${i.message}`) };
}

/**
 * 기록(Attempt.mode / Session.modeId)에 남기는 이름.
 * 기본 모드는 예전 기록과 같게 'all' 또는 typeId, 나머지는 모드 id.
 */
export const recordMode = (mode: Mode, isDefault: boolean, typeId: string | null) =>
  isDefault ? (typeId ?? 'all') : mode.id;
