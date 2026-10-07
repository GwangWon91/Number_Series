/**
 * 기기별 편의 설정과 진행 중 세션 (localStorage).
 * 저장이 막힌 환경(사생활 보호 모드 등)에서도 앱은 동작해야 하므로 모든 접근을 try/catch로 감싼다.
 */
export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장 불가 환경: 무시 */
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* 무시 */
  }
}

export interface Prefs {
  /** true면 선택 후 한 번 더 눌러야 제출 (흔들리는 차 안 오탭 방지) */
  confirmBeforeSubmit: boolean;
}

const PREFS_KEY = 'prefs';
export const loadPrefs = (): Prefs => readJson<Prefs>(PREFS_KEY, { confirmBeforeSubmit: false });
export const savePrefs = (p: Prefs) => writeJson(PREFS_KEY, p);
