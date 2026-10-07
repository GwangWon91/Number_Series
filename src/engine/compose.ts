import type { Difficulty, EngineConfig, QuestionKind, TypeConfig } from './config';
import { getType } from './config';
import { distractorPool } from './distractors';
import { getFamily, type FitResult } from './families';
import type { Item } from './item';
import { analyzeQuestion, applyPairOp, PAIR_OPS, type PairOp, type Question } from './question';
import { Rng } from './rng';
import { analyze, judge, type Analysis } from './solver';
import {
  decimalDigits,
  formatValue,
  isFrac,
  numKey,
  rational,
  toNumber,
  withNotation,
  type Notation,
  type Value,
} from './value';

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
  | 'unsolvable' // 이 묻는 방식으로는 solver가 정답을 재확인 못함 (유형과 형식이 안 맞음)
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
  // 소수·대분수 표기는 약분한 값으로 (15.25 = 1525/100 → 61/4)
  const r = isFrac(v) && v.fmt ? rational(v.n, v.d) : v;
  return isFrac(r) ? ok(r.n) && ok(r.d) : ok(r);
}

function pickBlank(rng: Rng, type: TypeConfig, length: number): number {
  const mode = rng.weighted({ last: type.blank.last, middle: type.blank.middle });
  const lo = Math.max(type.blank.minMiddleIndex, 1);
  const hi = length - 2;
  return mode === 'middle' && lo <= hi ? rng.int(lo, hi) : length - 1;
}

/**
 * A·B 위치: B는 끝에서 3칸 이내, A는 B보다 2~3칸 앞 (실전 2026H2 10문항: A 2~5번째 칸, B는 A+2~A+3)
 */
function pickPair(rng: Rng, length: number): [number, number] {
  const ib = rng.int(Math.max(4, length - 3), length - 1);
  const ia = rng.int(Math.max(2, ib - 3), ib - 2);
  return [ia, ib];
}

const pairLine = (op: PairOp, a: Value, b: Value, v: Value) =>
  `A = ${formatValue(a)}, B = ${formatValue(b)} → A ${op} B = ${formatValue(v)}`;

/** A·B 오답: 한쪽·양쪽을 근처 값으로 바꾼 연산값, 다른 연산으로 계산한 값, 순서를 바꾼 값 */
function pairDistractors(
  rng: Rng,
  terms: readonly Value[],
  [ia, ib]: [number, number],
  op: PairOp,
  weights: EngineConfig['exam']['distractors'],
  size: number,
): Value[] {
  const near = (i: number) => {
    const s: (Value | null)[] = terms.slice();
    s[i] = null;
    return distractorPool(rng, s, i, terms[i], weights, 3);
  };
  const [a, b] = [terms[ia], terms[ib]];
  const as = [a, ...near(ia)];
  const bs = [b, ...near(ib)];
  const out: (Value | null)[] = [];
  for (const x of as) for (const y of bs) if (x !== a || y !== b) out.push(applyPairOp(op, x, y));
  for (const o of PAIR_OPS) if (o !== op) out.push(applyPairOp(o, a, b));
  if (op === '−' || op === '/') out.push(applyPairOp(op, b, a));
  // 정답이 양수인데 0 이하인 오답은 바로 소거되므로 쓰지 않는다
  const answer = applyPairOp(op, a, b);
  const positive = answer !== null && toNumber(answer) > 0;
  const ok = (v: Value | null): v is Value => v !== null && (!positive || toNumber(v) > 0);
  return rng.shuffle(out.filter(ok)).slice(0, size);
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

  const qs = config.exam.questions;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // 비중이 하나뿐이면 rng를 쓰지 않는다 (빈칸 1개만 내는 설정의 기존 seed 재현 유지)
    const activeKinds = Object.entries(qs.kinds).filter(([, w]) => (w ?? 0) > 0);
    const kind = (activeKinds.length > 1 ? rng.weighted(qs.kinds) : (activeKinds[0]?.[0] ?? 'blank')) as QuestionKind;
    const ahead = kind === 'nth' ? rng.range(qs.nthAhead) : 0;
    const length = rng.range(type.length) + (kind === 'pair' ? qs.pairExtraLength : ahead);
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

    const family = getFamily(g.family);
    const weights = config.exam.distractors;
    let shown: (Value | null)[];
    let blank: number;
    let answer: Value;
    let question: Question | undefined;
    let intended: FitResult | null;
    let pool: Value[];
    let analysis: Analysis;

    if (kind === 'pair') {
      const [ia, ib] = pickPair(rng, terms.length);
      const op = rng.weighted(qs.pairOps) as PairOp;
      const v = applyPairOp(op, terms[ia], terms[ib]);
      if (v === null) {
        reject('generate');
        continue;
      }
      blank = ia;
      answer = v;
      shown = terms.slice();
      shown[ia] = shown[ib] = null;
      question = { kind: 'pair', op, blanks: [ia, ib], values: [terms[ia], terms[ib]] };
      const fit = family.fit(terms, null);
      intended = fit && { redundancy: fit.redundancy - 2, explain: [...fit.explain, pairLine(op, terms[ia], terms[ib], v)] };
      pool = intended ? pairDistractors(rng, terms, [ia, ib], op, weights, choiceCount * 3) : [];
      analysis = analyzeQuestion(shown, question, { pairs: [[terms[ia], terms[ib]]] });
    } else if (kind === 'nth') {
      const n = terms.length;
      blank = n - 1;
      answer = terms[n - 1];
      shown = terms.slice(0, n - ahead);
      question = { kind: 'nth', n };
      const fit = family.fit(shown as Value[], null);
      intended = fit && {
        redundancy: fit.redundancy,
        explain: [...fit.explain, `이어 쓰면 ${terms.slice(n - ahead).map(formatValue).join(', ')} → ${n}번째 ${formatValue(answer)}`],
      };
      const hidden = [...terms.slice(0, n - 1), null];
      pool = [terms[n - 2], ...distractorPool(rng, hidden, n - 1, answer, weights, choiceCount * 3)];
      analysis = analyzeQuestion(shown, question);
    } else {
      blank = pickBlank(rng, type, terms.length);
      answer = terms[blank];
      shown = terms.slice();
      shown[blank] = null;
      intended = family.fit(terms, blank);
      pool = intended ? distractorPool(rng, shown, blank, answer, weights, choiceCount * 3) : [];
      analysis = analyze(shown, [answer, ...pool]);
    }

    if (!intended) {
      // 빈칸 1개에서 실패하면 생성기 버그, nth는 보이는 항이 규칙 단위(군수열 3개씩)에 안 맞는 경우
      reject(kind === 'blank' ? 'self' : 'unsolvable');
      continue;
    }
    if (intended.redundancy < minRed) {
      reject('redundancy');
      continue;
    }
    const verdict = judge(analysis, answer, minRed, altMinRedundancy);
    if (verdict.alternatives.length > 0) {
      reject('ambiguous');
      continue;
    }
    // solver가 정답을 재확인하지 못하는 형식 (예: 군수열의 n번째 항은 다음 묶음을 예측할 수 없다)
    if (verdict.supporting.length === 0) {
      reject('unsolvable');
      continue;
    }

    // 다른 규칙으로 "설명되는" 값은 오답 선택지로 쓰지 않는다 (복수 정답 방지)
    const explained = new Set(
      analysis.explanations.filter((e) => e.redundancy >= altMinRedundancy).map((e) => numKey(e.value)),
    );
    // 화면 표기: 정해진 유형만 (분자·분모 규칙인 fraction은 보이는 그대로여야 하므로 설정 안 함)
    const known = [...shown.filter((v): v is Value => v !== null), answer];
    let notation: Notation | null = type.display.notation ? (rng.weighted(type.display.notation) as Notation) : null;
    let digits = 0;
    if (notation === 'dec') {
      const ds = known.map(decimalDigits);
      if (ds.some((d) => d === null)) notation = 'frac';
      else digits = Math.max(...(ds as number[]));
    }
    const fits = (v: Value) => notation !== 'dec' || (decimalDigits(v) ?? 9) <= digits;

    const seen = new Set([numKey(answer)]);
    const distractors = pool
      .filter((v) => !explained.has(numKey(v)) && (kind === 'pair' || inNumberRange(v, type)) && fits(v))
      .filter((v) => !seen.has(numKey(v)) && seen.add(numKey(v)))
      .slice(0, choiceCount - 1);
    if (distractors.length < choiceCount - 1) {
      reject('distractors');
      continue;
    }

    if (notation) {
      const conv = (v: Value) => withNotation(v, notation!, digits);
      // 혼용: 항마다 문항 표기(선택지와 같음)와 다른 표기 중 하나 → 선택지 표기가 수열과 동떨어지지 않게
      const mix = rng.chance(type.display.mixNotation);
      const other: Notation = notation === 'dec' ? 'frac' : 'dec';
      shown = shown.map((t) =>
        t === null ? null : mix ? withNotation(t, rng.pick([notation!, other])) : conv(t),
      );
      answer = conv(answer);
      distractors.splice(0, distractors.length, ...distractors.map(conv));
      if (question?.kind === 'pair' && question.values) question.values = [conv(question.values[0]), conv(question.values[1])];
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
        question,
        answer,
        choices,
        explain: intended.explain,
        groupSize: type.display.groupSeparator ? g.groupSize : undefined,
      },
    };
  }
  return { item: null, attempts: maxRetries, rejects };
}
