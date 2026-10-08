import { z } from 'zod';

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

export type Theme = 'system' | 'light' | 'dark';

/** 설정 화면 3단 선택과 홈의 순환 버튼이 같은 순서·이름을 쓴다 */
export const THEME_OPTIONS: readonly (readonly [Theme, string])[] = [
  ['system', '기기 설정 따름'],
  ['light', '밝게'],
  ['dark', '어둡게'],
];

/** 필드마다 기본값으로 대체 → 손상·이전 버전 값이 섞여도 버전 번호·마이그레이션 없이 읽힌다 (형식이 호환 안 되게 바뀌면 그때 버전 필드) */
const prefsSchema = z.object({
  /** true면 선택 후 한 번 더 눌러야 제출 (흔들리는 차 안 오탭 방지) */
  confirmBeforeSubmit: z.boolean().catch(false),
  theme: z.enum(['system', 'light', 'dark']).catch('system'),
  /** 정답·오답 효과음 (기본 켜짐) */
  sound: z.boolean().catch(true),
  /** 진동 (지원 기기만) */
  haptics: z.boolean().catch(true),
});
export type Prefs = z.infer<typeof prefsSchema>;

/** 화면 진행 표시용 값 (기기별): 이미 축하한 업적, 첫 방문 안내를 봤는지 */
const gameUiSchema = z.object({
  seenAchievements: z.array(z.string()).catch([]),
  onboarded: z.boolean().catch(false),
});
export type GameUi = z.infer<typeof gameUiSchema>;
export const loadGameUi = (): GameUi => gameUiSchema.parse(readJson<object>('game-ui', {}));
export const saveGameUi = (g: GameUi) => writeJson('game-ui', g);

const PREFS_KEY = 'prefs';
export const loadPrefs = (): Prefs => prefsSchema.parse(readJson<object>(PREFS_KEY, {}));
export const savePrefs = (p: Prefs) => writeJson(PREFS_KEY, p);

/** styles.css --bg와 같은 값 (meta theme-color는 CSS 변수를 못 읽는다) */
const THEME_COLOR = { light: '#f3f5f8', dark: '#1d2026' } as const;

/** <html data-theme>와 브라우저 상단 색(theme-color)을 맞춘다. system이면 OS 설정을 따른다. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    m.dataset.original ??= m.content;
    m.content = theme === 'system' ? m.dataset.original : THEME_COLOR[theme];
  });
}
