/**
 * 비공개 기출(data/bank/private) → 숫자를 바꾼 공개 변형 문항(data/bank/public/variants.yaml).
 *
 *   npm run bank:variants          # 다시 만들기 (결과는 항상 같다)
 *
 * 각 문항에 숫자 변환(분수의 분자·분모 이동, 값 x → k·x + c)을 적용하고, 다음을 모두 만족하는 것만 남긴다 (문항당 최대 2개):
 *  - 원래 문항을 설명하던 규칙 계열이 모두 그대로 성립하고, 다른 값을 내는 해석이 없다 (checkBankEntry 경고 0)
 *    (등비수열에 상수를 더하면 ×r+c 규칙이 되므로 탈락 — 유형 이름이 해설 첫 줄로 쓰이기 때문)
 *  - 숫자가 유형의 범위 안 (음수 없던 문항은 음수 없음, 진분수 문항은 진분수)
 * 선택지도 같은 변환을 받으므로 오답의 성격(근처 값·흔한 실수)이 유지된다.
 * A·B 문항은 연산에 따라 정답·선택지가 변하는 방식이 달라서 덧셈·뺄셈은 배율·이동, 곱셈·나눗셈은 배율만 쓴다.
 * 원문은 공개하지 않는다: 숫자가 모두 바뀌고, 선택지 순서를 섞고, 규칙 설명은 유형 이름으로 바꾼다.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { bankToItem, checkBankEntry, type BankEntry } from '../src/engine/bank';
import { inNumberRange } from '../src/engine/compose';
import { getType, typeLabel } from '../src/engine/config';
import { applyPairOp, type PairOp } from '../src/engine/question';
import { Rng } from '../src/engine/rng';
import { formatValue, frac, isFrac, toNumber, type Value } from '../src/engine/value';
import { loadBank, requireConfig, ROOT } from '../src/node/load';

const PER_ITEM = 2;
const OUT = join(ROOT, 'data/bank/public/variants.yaml');
interface Transform {
  tag: string;
  /** 항·정답·선택지(빈칸·n번째 문항)에 적용 */
  f: (v: Value) => Value;
  /** A·B 연산값이 바뀌는 방식. null이면 A·B 문항에는 쓰지 않는다 */
  pair: (op: PairOp) => ((v: Value) => Value) | null;
}

const affine = (v: Value, k: number, c: number): Value => (isFrac(v) ? frac(k * v.n + c * v.d, v.d, v.fmt) : k * v + c);

/** 값 x → k·x + c */
const scaleShift = (k: number, c: number): Transform => ({
  tag: `k${k}${c ? `c${c < 0 ? 'm' : ''}${Math.abs(c)}` : ''}`,
  f: (v) => affine(v, k, c),
  pair: (op) => {
    if (op === '+') return (v) => affine(v, k, 2 * c);
    if (op === '−') return (v) => affine(v, k, 0);
    if (c !== 0) return null;
    return op === '×' ? (v) => affine(v, k * k, 0) : (v) => v;
  },
});

/** 분수 표기(약분 안 함)의 분자 +a, 분모 +b — 분자·분모가 따로 규칙을 따르는 분수 수열용 */
const numDen = (a: number, b: number): Transform => ({
  tag: `n${a}d${b}`,
  f: (v) => (isFrac(v) && !v.fmt ? frac(v.n + a, v.d + b) : v),
  pair: () => null,
});

/** 시도 순서 (결과 재현을 위해 고정): 분자·분모 이동 → 값 이동 → 배율 → 둘 다 */
const TRANSFORMS: Transform[] = [
  ...[[1, 1], [2, 3], [1, 2], [3, 2], [2, 1]].map(([a, b]) => numDen(a, b)),
  ...[3, 5, -2, 7, 11].map((c) => scaleShift(1, c)),
  ...[2, 3].map((k) => scaleShift(k, 0)),
  ...[1, 4].flatMap((c) => [2, 3].map((k) => scaleShift(k, c))),
];

const config = requireConfig();
const { entries, errors } = loadBank(['private']);
if (errors.length) throw new Error(errors.join('\n'));

/** YAML에 쓸 원시 값 ("3/4", "2.70", "1 1/4", 정수) */
const raw = (v: Value): number | string => (isFrac(v) ? formatValue(v).replace('−', '-') : v);
const proper = (v: Value) => !isFrac(v) || v.fmt !== undefined || Math.abs(v.n) < Math.abs(v.d);

function variant(e: BankEntry, t: Transform, families: readonly string[]): BankEntry | null {
  const q = e.question;
  const terms = e.terms.map((x) => (x === null ? null : t.f(x)));
  let answer: Value;
  let choices: Value[];
  if (q?.kind === 'pair') {
    const values = bankToItem(e, config).question;
    const ab = values?.kind === 'pair' ? values.values : undefined;
    const g = t.pair(q.op);
    if (!ab || !g) return null;
    const v = applyPairOp(q.op, t.f(ab[0]), t.f(ab[1]));
    if (v === null) return null;
    answer = v;
    choices = e.choices.map(g);
  } else {
    answer = t.f(e.answer);
    choices = e.choices.map(t.f);
  }
  const v: BankEntry = {
    ...e,
    id: `var-${e.id}-${t.tag}`,
    terms,
    answer,
    choices: new Rng(hash(e.id + t.tag)).shuffle([...choices]),
    rule: e.typeId ? typeLabel(config, e.typeId) : '규칙을 찾아보세요',
    source: { kind: 'variant', round: e.source.round, note: '기출 유형 변형 (숫자 변경)' },
    publishable: true,
    visibility: 'public',
    file: 'data/bank/public/variants.yaml',
  };

  const shown = [...terms.filter((x): x is Value => x !== null), ...(q?.kind === 'pair' ? [] : [answer])];
  const original = [...e.terms.filter((x): x is Value => x !== null), e.answer];
  if (shown.every((x, i) => x === original[i])) return null; // 변환이 아무것도 안 바꿈 (분수 아닌 문항의 분자·분모 이동)
  if (original.every((x) => toNumber(x) >= 0) && shown.some((x) => toNumber(x) < 0)) return null;
  if (original.every(proper) && !shown.every(proper)) return null; // 진분수 문항은 진분수로
  const type = e.typeId ? getType(config, e.typeId) : null;
  if (!shown.every((x) => (type ? inNumberRange(x, type) : Math.abs(toNumber(x)) <= 999))) return null;

  const check = checkBankEntry(v, config);
  if (check.errors.length || check.warnings.length) return null;
  return families.every((f) => check.families.includes(f)) ? v : null;
}

const hash = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

const out: BankEntry[] = [];
const skipped: string[] = [];
for (const e of entries) {
  const base = checkBankEntry(e, config);
  if (base.errors.length || !base.families.length) {
    skipped.push(`${e.id}: 원문이 규칙으로 설명되지 않음`);
    continue;
  }
  const made: BankEntry[] = [];
  for (const t of TRANSFORMS) {
    const v = variant(e, t, base.families);
    if (v) made.push(v);
    if (made.length >= PER_ITEM) break;
  }
  if (!made.length) skipped.push(`${e.id}: 조건을 만족하는 변형 없음`);
  out.push(...made);
}

const yaml = out.map((v) => ({
  id: v.id,
  terms: v.terms.map((t, i) =>
    t !== null ? raw(t) : v.question?.kind === 'pair' ? (v.question.blanks[0] === i ? 'A' : 'B') : null,
  ),
  choices: v.choices.map(raw),
  answer: raw(v.answer),
  ...(v.question?.kind === 'pair' ? { op: v.question.op } : v.question?.kind === 'nth' ? { nth: v.question.n } : {}),
  ...(v.typeId ? { typeId: v.typeId } : {}),
  rule: v.rule,
  ...(v.difficulty ? { difficulty: v.difficulty } : {}),
  source: v.source,
  publishable: true,
}));

writeFileSync(
  OUT,
  `# 기출 유형 변형 문항 (공개). npm run bank:variants 로 다시 만든다 — 직접 고치지 말 것 (scripts/make-variants.ts).\n` +
    `# 비공개 기출의 숫자를 배율·이동으로 바꾸고, 같은 규칙으로 정답이 하나로 정해지는 것만 남겼다.\n` +
    stringify(yaml),
);
console.log(`변형 ${out.length}문항 (원문 ${entries.length}문항) → ${OUT}`);
if (skipped.length) console.log(`건너뜀 ${skipped.length}:\n  ${skipped.join('\n  ')}`);
