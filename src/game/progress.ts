/**
 * 성장 지표 (순수 함수): 업적과 주별 정답률.
 * 업적은 저장하지 않고 기록(append-only)에서 매번 계산한다 → 기기 간 동기화·마이그레이션이 필요 없다.
 * 원칙: 출석·횟수만 채우면 받는 업적은 없다. 모두 "더 잘 풀게 됨"을 보여 주는 조건이다.
 */
import type { Attempt, Session } from '../store/types';
import { skillOf, MAX_LEVEL, type Skills } from './adapt';

export interface History {
  attempts: readonly Attempt[];
  sessions: readonly Session[];
}

export interface ProgressContext {
  skills: Skills;
  /** 출제되는 유형 id (모든 유형 ★2 판정용) */
  typeIds: readonly string[];
}

export interface Achievement {
  id: string;
  label: string;
  description: string;
}

const sessionsOf = (h: History, modeId: string) => h.sessions.filter((s) => s.modeId === modeId);

/** 한 유형에서 처음 10문제 정답률 50% 이하 → 최근 10문제 80% 이상 */
function overcameWeakness(attempts: readonly Attempt[]): boolean {
  const byType = new Map<string, Attempt[]>();
  for (const a of attempts) byType.set(a.typeId, [...(byType.get(a.typeId) ?? []), a]);
  return [...byType.values()].some((xs) => {
    if (xs.length < 20) return false;
    const sorted = [...xs].sort((a, b) => a.ts - b.ts);
    const acc = (ys: Attempt[]) => ys.filter((y) => y.correct).length / ys.length;
    return acc(sorted.slice(0, 10)) <= 0.5 && acc(sorted.slice(-10)) >= 0.8;
  });
}

const DEFS: (Achievement & { test(h: History, c: ProgressContext): boolean })[] = [
  { id: 'first-session', label: '첫 세션', description: '세션 하나를 끝까지', test: (h) => h.sessions.length > 0 },
  {
    id: 'perfect-10',
    label: '무실수 10',
    description: '한 세션에서 10문제 이상 모두 정답',
    test: (h) => h.sessions.some((s) => s.total >= 10 && s.correct === s.total),
  },
  { id: 'combo-10', label: '10콤보', description: '10문제 연속 정답', test: (h) => h.sessions.some((s) => (s.maxCombo ?? 0) >= 10) },
  { id: 'combo-25', label: '25콤보', description: '25문제 연속 정답', test: (h) => h.sessions.some((s) => (s.maxCombo ?? 0) >= 25) },
  {
    id: 'exam-15',
    label: '실전 15+',
    description: '실전 모드 20문항 중 15문항 이상',
    test: (h) => sessionsOf(h, 'exam').some((s) => s.correct >= 15),
  },
  {
    id: 'time-attack-15',
    label: '번개',
    description: '타임어택 90초에 15문제 이상 정답',
    test: (h) => sessionsOf(h, 'time-attack').some((s) => s.correct >= 15),
  },
  {
    id: 'survival-20',
    label: '끈기',
    description: '서바이벌에서 20문제 이상',
    test: (h) => sessionsOf(h, 'survival').some((s) => s.total >= 20),
  },
  {
    id: 'type-master',
    label: '유형 정복',
    description: '한 유형을 ★3까지',
    test: (_, c) => c.typeIds.some((t) => skillOf(c.skills, t).level >= MAX_LEVEL),
  },
  {
    id: 'all-types-2',
    label: '고른 실력',
    description: '모든 유형 ★2 이상',
    test: (_, c) => c.typeIds.length > 0 && c.typeIds.every((t) => skillOf(c.skills, t).level >= 2),
  },
  {
    id: 'weak-overcome',
    label: '약점 극복',
    description: '처음 10문제 정답률 50% 이하였던 유형을 최근 10문제 80% 이상으로',
    test: (h) => overcameWeakness(h.attempts),
  },
];

export const ACHIEVEMENTS: readonly Achievement[] = DEFS.map(({ id, label, description }) => ({ id, label, description }));

export function unlockedIds(h: History, c: ProgressContext): Set<string> {
  return new Set(DEFS.filter((d) => d.test(h, c)).map((d) => d.id));
}

export interface WeekStat {
  /** 그 주 월요일 0시 (현지 시각) */
  start: number;
  solved: number;
  correct: number;
  avgMs: number;
}

const DAY = 24 * 60 * 60 * 1000;

function mondayOf(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/** 최근 weeks주(이번 주 포함)의 주별 풀이 수·정답 수·평균 시간. 안 푼 주도 0으로 포함 */
export function weekly(attempts: readonly Attempt[], now: number, weeks = 8): WeekStat[] {
  const first = mondayOf(now - (weeks - 1) * 7 * DAY);
  const out: WeekStat[] = Array.from({ length: weeks }, (_, i) => ({
    start: mondayOf(first + i * 7 * DAY + DAY), // +1일: 서머타임 경계에서도 같은 주로
    solved: 0,
    correct: 0,
    avgMs: 0,
  }));
  for (const a of attempts) {
    const i = out.findIndex((w, j) => a.ts >= w.start && (j === weeks - 1 || a.ts < out[j + 1].start));
    if (i < 0) continue;
    const w = out[i];
    w.avgMs = (w.avgMs * w.solved + a.elapsedMs) / (w.solved + 1);
    w.solved++;
    if (a.correct) w.correct++;
  }
  return out;
}
