import type { Difficulty, EngineConfig, TypeConfig } from './config';
import { getType } from './config';
import { distractorPool } from './distractors';
import { getFamily } from './families';
import type { Item } from './item';
import { Rng } from './rng';
import { analyze, judge } from './solver';
import { isFrac, numKey, toNumber, type Value } from './value';

/**
 * 생성 파이프라인: 유형·난이도 선택 → 생성기 → 범위 검사 → 빈칸 위치 → 자기 일관성
 * → 모호성 검사 → 오답 선택지 → 문항. 어느 단계든 실패하면 같은 rng로 재시도한다.
 */

export type RejectReason =
  | 'generate' // 생성기가 조건 불만족으로 포기
  | 'range' // 숫자 범위 위반
  | 'self' // 생성기가 지정한 규칙으로 자기 수열을 설명 못함 (생성기 버그)
  | 'redundancy' // 정답 규칙을 확정할 항이 부족
  | 'ambiguous' // 다른 규칙으로 다른 답이 나옴
  | 'distractors'; // 오답 선택지를 충분히 못 만듦

export interface GenerateSpec {
  seed: number;
  typeId?: string;
  difficulty?: Difficulty;
}

export interface GenerateOutcome {
  item: Item | null;
  attempts: number;
  rejects: Partial<Record<RejectReason, number>>;
}

export function pickType(config: EngineConfig, rng: Rng): TypeConfig {
  const weights: Record<string, number> = {};
  for (const t of config.types) if (t.enabled && t.weight > 0) weights[t.id] = t.weight;
  return getType(config, rng.weighted(weights));
}

export function pickDifficulty(config: EngineConfig, type: TypeConfig, rng: Rng): Difficulty {
  const defined = Object.keys(type.difficulty).map(Number) as Difficulty[];
  const weights: Record<string, number> = {};
  for (const d of defined) weights[d] = config.exam.difficultyMix[String(d) as '1'] ?? 0;
  if (Object.values(weights).every((w) => w === 0)) return rng.pick(defined);
  return Number(rng.weighted(weights)) as Difficulty;
}

export function inNumberRange(v: Value, type: TypeConfig): boolean {
  const ok = (n: number) => n >= type.numbers.min && n <= type.numbers.max;
  return isFrac(v) ? ok(v.n) && ok(v.d) : ok(v);
}

function pickBlank(rng: Rng, type: TypeConfig, length: number): number {
  const mode = rng.weighted({ last: type.blank.last, middle: type.blank.middle });
  const lo = Math.max(type.blank.minMiddleIndex, 1);
  const hi = length - 2;
  return mode === 'middle' && lo <= hi ? rng.int(lo, hi) : length - 1;
}

export function minRedundancyOf(config: EngineConfig, type: TypeConfig): number {
  return type.minRedundancy ?? config.validation.minRedundancy;
}

export function generateItem(config: EngineConfig, spec: GenerateSpec): GenerateOutcome {
  const rng = new Rng(spec.seed);
  const type = spec.typeId ? getType(config, spec.typeId) : pickType(config, rng);
  const difficulty = spec.difficulty ?? pickDifficulty(config, type, rng);
  const params = type.difficulty[difficulty];
  if (params === undefined) throw new Error(`${type.id}에 난이도 ${difficulty} 파라미터가 없습니다`);

  const minRed = minRedundancyOf(config, type);
  const { altMinRedundancy, maxRetries } = config.validation;
  const choiceCount = config.exam.choices;
  const rejects: GenerateOutcome['rejects'] = {};
  const reject = (r: RejectReason) => (rejects[r] = (rejects[r] ?? 0) + 1);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const length = rng.range(type.length);
    const g = type.plugin.generate({ rng, length, params });
    if (!g) {
      reject('generate');
      continue;
    }
    const { terms } = g;
    if (!terms.every((v) => inNumberRange(v, type))) {
      reject('range');
      continue;
    }

    const blank = pickBlank(rng, type, terms.length);
    const answer = terms[blank];
    const shown: (Value | null)[] = terms.slice();
    shown[blank] = null;

    const intended = getFamily(g.family).fit(terms, blank);
    if (!intended) {
      reject('self');
      continue;
    }
    if (intended.redundancy < minRed) {
      reject('redundancy');
      continue;
    }

    const pool = distractorPool(rng, shown, blank, answer, config.exam.distractors, choiceCount * 3);
    const analysis = analyze(shown, [answer, ...pool]);
    const verdict = judge(analysis, answer, minRed, altMinRedundancy);
    if (verdict.alternatives.length > 0) {
      reject('ambiguous');
      continue;
    }

    // 다른 규칙으로 "설명되는" 값은 오답 선택지로 쓰지 않는다 (복수 정답 방지)
    const explained = new Set(
      analysis.explanations.filter((e) => e.redundancy >= altMinRedundancy).map((e) => numKey(e.value)),
    );
    const distractors = pool
      .filter((v) => !explained.has(numKey(v)) && inNumberRange(v, type))
      .slice(0, choiceCount - 1);
    if (distractors.length < choiceCount - 1) {
      reject('distractors');
      continue;
    }

    const choices = [answer, ...distractors];
    if (config.exam.choiceOrder === 'ascending') choices.sort((a, b) => toNumber(a) - toNumber(b));
    else rng.shuffle(choices);

    return {
      attempts: attempt,
      rejects,
      item: {
        id: `gen:${type.id}:${difficulty}:${spec.seed}`,
        source: 'gen',
        typeId: type.id,
        difficulty,
        seed: spec.seed,
        configVersion: config.version,
        terms: shown,
        blankIndex: blank,
        answer,
        choices,
        explain: intended.explain,
        groupSize: type.display.groupSeparator ? g.groupSize : undefined,
      },
    };
  }
  return { item: null, attempts: maxRetries, rejects };
}
