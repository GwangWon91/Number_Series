/**
 * 수열의 항 값. 대부분 정수이고, 분수 유형만 Frac을 쓴다.
 * 분수는 약분하지 않고 "보이는 그대로" 저장한다(분자·분모 각각에 규칙이 있기 때문).
 */
export interface Frac {
  n: number;
  d: number;
}
export type Value = number | Frac;

export const isFrac = (v: Value): v is Frac => typeof v === 'object';
export const frac = (n: number, d: number): Frac => ({ n, d });

export function eqValue(a: Value, b: Value): boolean {
  if (isFrac(a) && isFrac(b)) return a.n === b.n && a.d === b.d;
  if (!isFrac(a) && !isFrac(b)) return a === b;
  return false;
}

/** 중복 판정·직렬화용 키 */
export function valueKey(v: Value): string {
  return isFrac(v) ? `${v.n}/${v.d}` : String(v);
}

/** 정렬·크기 비교용 실수값 */
export function toNumber(v: Value): number {
  return isFrac(v) ? v.n / v.d : v;
}

/** YAML/JSON의 원시 값(숫자 또는 "3/4")을 Value로 변환 */
export function parseValue(raw: unknown): Value {
  if (typeof raw === 'number' && Number.isInteger(raw)) return raw;
  if (typeof raw === 'string') {
    const m = raw.trim().match(/^(-?\d+)\s*\/\s*(-?\d+)$/);
    if (m) return frac(Number(m[1]), Number(m[2]));
    if (/^-?\d+$/.test(raw.trim())) return Number(raw);
  }
  if (raw && typeof raw === 'object' && 'n' in raw && 'd' in raw) {
    const { n, d } = raw as Frac;
    return frac(n, d);
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

/** 화면 표시용 (음수는 유니코드 마이너스) */
export function formatValue(v: Value): string {
  const f = (n: number) => (n < 0 ? `${MINUS}${-n}` : String(n));
  return isFrac(v) ? `${f(v.n)}/${f(v.d)}` : f(v);
}

/** 차이 표시용: +3, −2 */
export function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${MINUS}${-n}`;
}

export function plain(n: number): string {
  return n < 0 ? `${MINUS}${-n}` : String(n);
}
