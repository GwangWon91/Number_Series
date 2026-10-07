import { plain, signed } from '../value';
import type { IntRule } from './types';

/**
 * 정수 수열의 기본 규칙들. 각 규칙은
 *  - match: 수열 전체가 규칙을 따르는지 (자유 파라미터 수 포함)
 *  - next/prev: 앞부분/뒷부분으로부터 빈칸 후보 예측
 * 을 제공한다. 후보는 solver가 다시 검증하므로 next/prev는 "그럴듯한 후보"만 내면 된다.
 */

const last = (s: readonly number[]) => s[s.length - 1];

// ───────────────────────── 상수 / 등차 ─────────────────────────

export const constantRule: IntRule = {
  id: 'constant',
  label: '상수',
  minLength: 2,
  match(seq, fmt) {
    if (seq.length < 2 || seq.some((v) => v !== seq[0])) return null;
    return { params: 1, summary: `모두 ${fmt(seq[0])}` };
  },
  next: (s) => (s.length ? [last(s)] : []),
  prev: (s) => (s.length ? [s[0]] : []),
};

export const arithmeticRule: IntRule = {
  id: 'arithmetic',
  label: '등차수열',
  minLength: 3,
  match(seq) {
    if (seq.length < 3) return null;
    const d = seq[1] - seq[0];
    if (d === 0) return null;
    for (let i = 2; i < seq.length; i++) if (seq[i] - seq[i - 1] !== d) return null;
    return { params: 2, summary: d > 0 ? `${d}씩 증가` : `${-d}씩 감소` };
  },
  next: (s) => (s.length >= 2 ? [2 * last(s) - s[s.length - 2]] : []),
  prev: (s) => (s.length >= 2 ? [2 * s[0] - s[1]] : []),
};

// ───────────────────────── 곱셈·나눗셈 연산 ─────────────────────────

export type Op = { kind: 'add' | 'mul' | 'div'; k: number };

export function opText(op: Op): string {
  if (op.kind === 'add') return signed(op.k);
  if (op.kind === 'mul') return op.k < 0 ? `×(${plain(op.k)})` : `×${op.k}`;
  return op.k < 0 ? `÷(${plain(op.k)})` : `÷${op.k}`;
}

export function applyOp(op: Op, x: number): number | null {
  if (op.kind === 'add') return x + op.k;
  if (op.kind === 'mul') return x * op.k;
  return x % op.k === 0 ? x / op.k : null;
}

export function invertOp(op: Op, y: number): number | null {
  if (op.kind === 'add') return y - op.k;
  if (op.kind === 'mul') return y % op.k === 0 ? y / op.k : null;
  return y * op.k;
}

/** a → b 를 만드는 정수 배율(×k 또는 ÷k). |k| ≥ 2 만 인정한다. */
export function ratioOp(a: number, b: number): Op | null {
  if (a === 0 || b === 0) return null;
  if (b % a === 0) {
    const k = b / a;
    return Math.abs(k) >= 2 ? { kind: 'mul', k } : null;
  }
  if (a % b === 0) {
    const k = a / b;
    return Math.abs(k) >= 2 ? { kind: 'div', k } : null;
  }
  return null;
}

/** a → b 를 설명하는 단일 연산 후보들 (+k, ×k, ÷k) */
function stepOps(a: number, b: number): Op[] {
  const ops: Op[] = [];
  const r = ratioOp(a, b);
  if (r) ops.push(r);
  if (b !== a) ops.push({ kind: 'add', k: b - a });
  return ops;
}

const sameOp = (a: Op, b: Op) => a.kind === b.kind && a.k === b.k;

export const geometricRule: IntRule = {
  id: 'geometric',
  label: '등비수열',
  minLength: 3,
  match(seq) {
    if (seq.length < 3) return null;
    const op = ratioOp(seq[0], seq[1]);
    if (!op || op.kind === 'add') return null;
    for (let i = 1; i < seq.length; i++) if (applyOp(op, seq[i - 1]) !== seq[i]) return null;
    return { params: 2, summary: `${opText(op)}씩` };
  },
  next(s) {
    if (s.length < 2) return [];
    const op = ratioOp(s[s.length - 2], last(s));
    const v = op && applyOp(op, last(s));
    return v === null || v === undefined ? [] : [v];
  },
  prev(s) {
    if (s.length < 2) return [];
    const op = ratioOp(s[0], s[1]);
    const v = op && invertOp(op, s[0]);
    return v === null || v === undefined ? [] : [v];
  },
};

// ───────────────────────── 주기 반복 ─────────────────────────

export function cycleRule(period: number): IntRule {
  return {
    id: `cycle-${period}`,
    label: `${period}개 주기 반복`,
    minLength: period * 2,
    match(seq, fmt) {
      if (seq.length < period * 2) return null;
      for (let i = period; i < seq.length; i++) if (seq[i] !== seq[i - period]) return null;
      const pattern = seq.slice(0, period);
      if (pattern.every((v) => v === pattern[0])) return null;
      // 더 짧은 주기로 설명되면 그쪽에 맡긴다 (예: 주기 4 안의 주기 2)
      for (let p = 2; p < period; p++) {
        if (period % p === 0 && pattern.every((v, i) => v === pattern[i % p])) return null;
      }
      return { params: period, summary: `(${pattern.map(fmt).join(', ')}) 반복` };
    },
    next: (s) => (s.length >= period ? [s[s.length - period]] : []),
    prev: (s) => (s.length >= period ? [s[period - 1]] : []),
  };
}

// ───────────────────────── ×p + q ─────────────────────────

function solveAffine(s: readonly number[]): { p: number; q: number } | null {
  if (s.length < 3) return null;
  const d0 = s[1] - s[0];
  if (d0 === 0) return null;
  const num = s[2] - s[1];
  if (num % d0 !== 0) return null;
  const p = num / d0;
  if (p === 0 || p === 1 || Math.abs(p) > 10) return null;
  const q = s[1] - p * s[0];
  for (let i = 1; i < s.length; i++) if (s[i] !== p * s[i - 1] + q) return null;
  return { p, q };
}

export const affineRule: IntRule = {
  id: 'affine',
  label: '앞 항에 곱하고 더하기 (×a+b)',
  minLength: 4,
  match(seq) {
    const r = solveAffine(seq);
    if (!r || r.q === 0) return null; // q=0은 등비수열
    return { params: 3, summary: `앞 항 ${opText({ kind: 'mul', k: r.p })} ${signed(r.q)}` };
  },
  next(s) {
    const r = solveAffine(s.slice(-3));
    return r ? [r.p * last(s) + r.q] : [];
  },
  prev(s) {
    const r = solveAffine(s.slice(0, 3));
    if (!r) return [];
    const x = (s[0] - r.q) / r.p;
    return Number.isInteger(x) ? [x] : [];
  },
};

// ───────────────────────── 두 연산 번갈아 ─────────────────────────

/** parity(0/1) 위치의 단계(i → i+1)를 모두 만족하는 연산들 */
function opsForParity(s: readonly number[], parity: number): Op[] | null {
  let ops: Op[] | null = null;
  for (let i = parity; i + 1 < s.length; i += 2) {
    const here = stepOps(s[i], s[i + 1]);
    ops = ops === null ? here : ops.filter((o) => here.some((h) => sameOp(h, o)));
  }
  return ops;
}

export const alternatingOpsRule: IntRule = {
  id: 'alternating-ops',
  label: '두 연산을 번갈아 적용',
  minLength: 5,
  match(seq) {
    if (seq.length < 5) return null;
    const even = opsForParity(seq, 0);
    const odd = opsForParity(seq, 1);
    if (!even?.length || !odd?.length) return null;
    // 곱셈·나눗셈 연산을 우선 채택 (덧셈끼리 번갈아는 "차이 주기 반복"이 설명한다)
    const pick = (ops: Op[]) => ops.find((o) => o.kind !== 'add') ?? ops[0];
    const a = pick(even);
    const b = pick(odd);
    if (a.kind === 'add' && b.kind === 'add') return null;
    if (sameOp(a, b)) return null; // 같은 연산 반복이면 등비수열
    return { params: 3, summary: `${opText(a)}, ${opText(b)}을(를) 번갈아 적용` };
  },
  next(s) {
    if (s.length < 2) return [];
    const parity = (s.length - 1) % 2;
    const ops = opsForParity(s, parity) ?? [];
    return ops.map((o) => applyOp(o, last(s))).filter((v): v is number => v !== null);
  },
  prev(s) {
    if (s.length < 3) return [];
    // 새 단계(-1 → 0)는 단계 1과 같은 홀짝
    const ops = opsForParity(s, 1) ?? [];
    return ops.map((o) => invertOp(o, s[0])).filter((v): v is number => v !== null);
  },
};

// ───────────────────────── 거듭제곱 ± 상수 ─────────────────────────

const SUP: Record<number, string> = { 2: '²', 3: '³' };

function solvePower(s: readonly number[]): { p: number; b: number; c: number } | null {
  if (s.length < 3) return null;
  for (const p of [2, 3]) {
    for (let b = 0; b <= 40; b++) {
      const c = s[0] - b ** p;
      if (s.every((v, i) => v === (b + i) ** p + c)) return { p, b, c };
    }
  }
  return null;
}

export const powerRule: IntRule = {
  id: 'power',
  label: '거듭제곱 ± 상수',
  minLength: 4,
  match(seq) {
    if (seq.length < 4) return null;
    const r = solvePower(seq);
    if (!r) return null;
    const sup = SUP[r.p];
    const bases = `${r.b}${sup}, ${r.b + 1}${sup}, ${r.b + 2}${sup}, …`;
    const summary = r.c === 0 ? bases : `${bases}에 ${signed(r.c)}`;
    return { params: 2, summary };
  },
  next(s) {
    const r = solvePower(s);
    return r ? [(r.b + s.length) ** r.p + r.c] : [];
  },
  prev(s) {
    const r = solvePower(s);
    return r ? [(r.b - 1) ** r.p + r.c] : [];
  },
};

// ───────────────────────── 앞 항들의 합·곱 (피보나치형) ─────────────────────────

interface RecurrenceSpec {
  id: string;
  label: string;
  order: number;
  /** true면 "+c" 상수항이 있는 변형 (c ≠ 0) */
  withConstant: boolean;
  combine(window: readonly number[]): number;
  /** s[0..order] 와 c로부터 s[-1]을 역산 */
  invert(s: readonly number[], c: number): number | null;
  /** 예시 계산식 (window → result) */
  example(window: readonly number[], result: number, c: number): string;
  summary(c: number): string;
}

function recurrenceRule(spec: RecurrenceSpec): IntRule {
  const { order, withConstant } = spec;
  const params = order + (withConstant ? 1 : 0);
  const constantOf = (s: readonly number[]) =>
    withConstant ? s[order] - spec.combine(s.slice(0, order)) : 0;

  return {
    id: spec.id,
    label: spec.label,
    minLength: params + 2,
    match(seq) {
      if (seq.length < params + 2) return null;
      if (seq.every((v) => v === seq[0])) return null;
      const c = constantOf(seq);
      if (withConstant && c === 0) return null;
      for (let i = order; i < seq.length; i++) {
        if (seq[i] !== spec.combine(seq.slice(i - order, i)) + c) return null;
      }
      const examples = [order, order + 1].map((i) =>
        spec.example(seq.slice(i - order, i), seq[i], c),
      );
      return {
        params,
        summary: spec.summary(c),
        explain: [`${spec.label} — ${spec.summary(c)}`, `${examples.join(', ')}, …`],
      };
    },
    next(s) {
      if (s.length < params) return [];
      const c = constantOf(s);
      return [spec.combine(s.slice(-order)) + c];
    },
    prev(s) {
      if (s.length < params) return [];
      const x = spec.invert(s, constantOf(s));
      return x === null ? [] : [x];
    },
  };
}

const sum = (w: readonly number[]) => w.reduce((a, b) => a + b, 0);
const sumText = (w: readonly number[], r: number, c: number) =>
  `${w.map(plain).join(' + ')}${c ? ` ${signed(c)}` : ''} = ${plain(r)}`;

export const fibSumRule = recurrenceRule({
  id: 'fib-sum',
  label: '피보나치형',
  order: 2,
  withConstant: false,
  combine: sum,
  invert: (s) => s[1] - s[0],
  example: sumText,
  summary: () => '앞의 두 항을 더한 값',
});

export const fibSumConstRule = recurrenceRule({
  id: 'fib-sum-const',
  label: '피보나치형 (상수 추가)',
  order: 2,
  withConstant: true,
  combine: sum,
  invert: (s, c) => s[1] - s[0] - c,
  example: sumText,
  summary: (c) => `앞의 두 항을 더하고 ${signed(c)}`,
});

export const tribonacciRule = recurrenceRule({
  id: 'tribonacci',
  label: '세 항 합',
  order: 3,
  withConstant: false,
  combine: sum,
  invert: (s) => s[2] - s[1] - s[0],
  example: sumText,
  summary: () => '앞의 세 항을 더한 값',
});

export const fibProductRule = recurrenceRule({
  id: 'fib-product',
  label: '두 항 곱',
  order: 2,
  withConstant: false,
  combine: (w) => w[0] * w[1],
  invert: (s) => (s[0] !== 0 && s[1] % s[0] === 0 ? s[1] / s[0] : null),
  example: (w, r) => `${w.map(plain).join(' × ')} = ${plain(r)}`,
  summary: () => '앞의 두 항을 곱한 값',
});
