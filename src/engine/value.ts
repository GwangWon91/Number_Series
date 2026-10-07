/**
 * 수열의 항 값 = 정확한 유리수 + 표기.
 * 분수는 약분하지 않고 "보이는 그대로" 저장한다(분자·분모 각각에 규칙이 있기 때문).
 * fmt: 'dec' = 소수 표기(d는 10의 거듭제곱, 자릿수 유지 2.70), 'mixed' = 대분수 표기(1 1/4 = 5/4).
 */
export interface Frac {
  n: number;
  d: number;
  fmt?: 'dec' | 'mixed';
}
export type Value = number | Frac;

export const isFrac = (v: Value): v is Frac => typeof v === 'object';
export const frac = (n: number, d: number, fmt?: Frac['fmt']): Frac => (fmt ? { n, d, fmt } : { n, d });

/** 표기까지 같은지 (선택지·문항 중복 판정용). 값만 비교하려면 eqNum */
export function eqValue(a: Value, b: Value): boolean {
  if (isFrac(a) && isFrac(b)) return a.n === b.n && a.d === b.d;
  if (!isFrac(a) && !isFrac(b)) return a === b;
  return false;
}

const nd = (v: Value): [number, number] => (isFrac(v) ? [v.n, v.d] : [v, 1]);

/** 유리수 값이 같은지 (정답 판정용): 1/2 = 2/4 = 0.5 */
export function eqNum(a: Value, b: Value): boolean {
  const [an, ad] = nd(a);
  const [bn, bd] = nd(b);
  return an * bd === bn * ad;
}

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

/** 약분한 값. 분모가 1이면 정수 */
export function rational(n: number, d: number): Value {
  if (d < 0) [n, d] = [-n, -d];
  const g = gcd(n, d) || 1;
  return d / g === 1 ? n / g : frac(n / g, d / g);
}

/** 약분한 분모 (정수면 1) */
export const reducedDen = (v: Value): number => (isFrac(v) ? Math.abs(v.d) / (gcd(v.n, v.d) || 1) : 1);

export const mulV = (a: Value, b: Value): Value => {
  const [an, ad] = nd(a);
  const [bn, bd] = nd(b);
  return rational(an * bn, ad * bd);
};

export const addV = (a: Value, b: Value): Value => {
  const [an, ad] = nd(a);
  const [bn, bd] = nd(b);
  return rational(an * bd + bn * ad, ad * bd);
};

export const subV = (a: Value, b: Value): Value => {
  const [bn, bd] = nd(b);
  return addV(a, frac(-bn, bd));
};

export const divV = (a: Value, b: Value): Value | null => {
  const [an, ad] = nd(a);
  const [bn, bd] = nd(b);
  return bn === 0 ? null : rational(an * bd, ad * bn);
};

export type Notation = 'frac' | 'dec' | 'mixed';

/** 소수로 쓸 때 필요한 자릿수 (분모가 2·5로만 이루어져야 함, 최대 3자리). 불가능하면 null */
export function decimalDigits(v: Value): number | null {
  let d = reducedDen(v);
  let k2 = 0;
  let k5 = 0;
  for (; d % 2 === 0; d /= 2) k2++;
  for (; d % 5 === 0; d /= 5) k5++;
  const k = Math.max(k2, k5);
  return d === 1 && k <= 3 ? k : null;
}

/** 같은 값을 다른 표기로: frac = 약분한 분수, dec = 소수(digits 자리 이상), mixed = 대분수 */
export function withNotation(v: Value, fmt: Notation, digits = 0): Value {
  const r = isFrac(v) ? rational(v.n, v.d) : v;
  if (fmt === 'frac') return r;
  if (fmt === 'mixed') return isFrac(r) && Math.abs(r.n) > r.d ? frac(r.n, r.d, 'mixed') : r;
  const need = decimalDigits(v);
  if (need === null) return r;
  const k = Math.max(digits, need);
  if (k === 0) return r;
  const D = 10 ** k;
  return frac(Math.round(toNumber(v) * D), D, 'dec');
}

/** 중복 판정·직렬화용 키 (표기 기준) */
export function valueKey(v: Value): string {
  return isFrac(v) ? `${v.n}/${v.d}` : String(v);
}

/** 값 기준 키 (약분 후) */
export const numKey = (v: Value): string => {
  const [n, d] = nd(v);
  return valueKey(rational(n, d));
};

/** 정렬·크기 비교용 실수값 */
export function toNumber(v: Value): number {
  return isFrac(v) ? v.n / v.d : v;
}

/** YAML/JSON의 원시 값(정수, "3/4", "2.70", "1 1/4")을 Value로 변환 */
export function parseValue(raw: unknown): Value {
  if (typeof raw === 'number' && Number.isInteger(raw)) return raw;
  if (typeof raw === 'number' && Number.isFinite(raw)) return parseValue(String(raw));
  if (typeof raw === 'string') {
    const s = raw.trim();
    let m = s.match(/^(-?\d+)\s*\/\s*(-?\d+)$/);
    if (m) return frac(Number(m[1]), Number(m[2]));
    if (/^-?\d+$/.test(s)) return Number(s);
    if ((m = s.match(/^(-?)(\d+)\.(\d+)$/))) {
      const n = Number(m[2] + m[3]);
      return frac(m[1] ? -n : n, 10 ** m[3].length, 'dec');
    }
    if ((m = s.match(/^(-?)(\d+)\s+(\d+)\/(\d+)$/))) {
      const d = Number(m[4]);
      const n = Number(m[2]) * d + Number(m[3]);
      return frac(m[1] ? -n : n, d, 'mixed');
    }
  }
  if (raw && typeof raw === 'object' && 'n' in raw && 'd' in raw) {
    const { n, d, fmt } = raw as Frac;
    return frac(n, d, fmt);
  }
  throw new Error(`수열 값으로 해석할 수 없음: ${JSON.stringify(raw)}`);
}

export function allInts(seq: readonly Value[]): seq is number[] {
  return seq.every((v) => typeof v === 'number');
}

export function allFracs(seq: readonly Value[]): seq is Frac[] {
  return seq.every(isFrac);
}

export function uniqueValues(values: readonly Value[]): Value[] {
  const seen = new Set<string>();
  const out: Value[] = [];
  for (const v of values) {
    const k = valueKey(v);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(v);
    }
  }
  return out;
}

const MINUS = '−';

/** 화면 표시용 (음수는 유니코드 마이너스). 대분수는 "1 1/4", 소수는 자릿수 유지 "2.70" */
export function formatValue(v: Value): string {
  const f = (n: number) => (n < 0 ? `${MINUS}${-n}` : String(n));
  if (!isFrac(v)) return f(v);
  const sign = v.n * v.d < 0 ? MINUS : '';
  const [n, d] = [Math.abs(v.n), Math.abs(v.d)];
  if (v.fmt === 'dec') {
    const k = Math.round(Math.log10(d));
    const s = String(n).padStart(k + 1, '0');
    return `${sign}${s.slice(0, -k)}.${s.slice(-k)}`;
  }
  if (v.fmt === 'mixed' && n >= d) {
    const w = Math.floor(n / d);
    return n % d ? `${sign}${w} ${n % d}/${d}` : `${sign}${w}`;
  }
  return `${f(v.n)}/${f(v.d)}`;
}

/** 차이 표시용: +3, −2 */
export function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${MINUS}${-n}`;
}

export function plain(n: number): string {
  return n < 0 ? `${MINUS}${-n}` : String(n);
}
