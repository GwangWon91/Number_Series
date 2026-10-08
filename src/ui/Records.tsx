import { useEffect, useState } from 'react';
import { config } from '../app/engine';
import { typeLabel } from '../engine/config';
import { skillOf } from '../game/adapt';
import { ACHIEVEMENTS, unlockedIds, weekly, type WeekStat } from '../game/progress';
import { history, recordSummary, type RecordSummary, type TallyRow } from '../store/records';
import { loadSkills } from './practiceState';

const KIND_LABEL: Record<string, string> = { blank: '빈칸 1개', pair: 'A, B 두 빈칸', nth: 'n번째 수 묻기' };

const pct = (r: { solved: number; wrong: number }) => Math.round(((r.solved - r.wrong) / r.solved) * 100);

/** 정답률 막대 (초록이 맞힌 비율). level이 있으면 숙련 ★ */
function Tally({ rows, label, level }: { rows: TallyRow[]; label: (key: string) => string; level?: (key: string) => number }) {
  return (
    <ul className="tally">
      {rows.map((r) => (
        <li key={r.key}>
          <span className="name">
            {label(r.key)}
            {level && (
              <span className="stars" aria-label={`숙련 ${level(r.key)}단계`}>
                {' '}
                {'★'.repeat(level(r.key))}
                {'☆'.repeat(3 - level(r.key))}
              </span>
            )}
          </span>
          <span className="count">
            정답률 <b>{pct(r)}%</b> · {r.solved}문제
          </span>
          <span className="bar" aria-hidden>
            <span style={{ width: `${pct(r)}%` }} />
          </span>
          <span className="avg">평균 {Math.round(r.avgMs / 1000)}초</span>
        </li>
      ))}
    </ul>
  );
}

const md = (ts: number) => {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

/**
 * 주별 정답률 선 그래프 (계열 1개 → 범례 없음, 제목이 이름). 안 푼 주는 점 없이 선이 끊긴다.
 * 점마다 마우스를 올리면 그 주의 정답률·문제 수 (SVG title), 표로 보기 제공.
 */
function Growth({ weeks }: { weeks: WeekStat[] }) {
  const W = 320;
  const H = 150;
  const pad = { l: 40, r: 44, t: 12, b: 24 };
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / (weeks.length - 1);
  const y = (p: number) => pad.t + ((100 - p) * (H - pad.t - pad.b)) / 100;
  const pts = weeks.map((w, i) => (w.solved ? { i, p: Math.round((w.correct / w.solved) * 100), w } : null));
  // 안 푼 주에서 끊긴 구간들
  const runs: { i: number; p: number }[][] = [];
  pts.forEach((pt, i) => {
    if (!pt) return;
    if (i > 0 && pts[i - 1]) runs[runs.length - 1].push(pt);
    else runs.push([pt]);
  });
  const last = [...pts].reverse().find(Boolean);

  return (
    <figure className="growth">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="최근 8주 주별 정답률">
        {[0, 50, 100].map((p) => (
          <g key={p}>
            <line className="grid" x1={pad.l} x2={W - pad.r} y1={y(p)} y2={y(p)} />
            <text className="tick" x={pad.l - 6} y={y(p) + 4} textAnchor="end">
              {p}%
            </text>
          </g>
        ))}
        {weeks.map((w, i) =>
          i % 2 === weeks.length % 2 || i === weeks.length - 1 ? (
            <text key={w.start} className="tick" x={x(i)} y={H - 6} textAnchor="middle">
              {i === weeks.length - 1 ? '이번 주' : md(w.start)}
            </text>
          ) : null,
        )}
        {runs.map((run, k) => (
          <polyline key={k} className="line" points={run.map((pt) => `${x(pt.i)},${y(pt.p)}`).join(' ')} />
        ))}
        {pts.map(
          (pt) =>
            pt && (
              <g key={pt.i} className="pt">
                <title>{`${md(pt.w.start)} 주: 정답률 ${pt.p}% · ${pt.w.solved}문제 · 평균 ${Math.round(pt.w.avgMs / 1000)}초`}</title>
                <circle className="hit" cx={x(pt.i)} cy={y(pt.p)} r={12} />
                <circle className="dot" cx={x(pt.i)} cy={y(pt.p)} r={4} />
              </g>
            ),
        )}
        {last && (
          <text className="end-label" x={x(last.i) + 8} y={y(last.p) + 4}>
            {last.p}%
          </text>
        )}
      </svg>
      <details>
        <summary>표로 보기</summary>
        <table>
          <thead>
            <tr>
              <th>주</th>
              <th>문제</th>
              <th>정답률</th>
              <th>평균 시간</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.start}>
                <td>{md(w.start)}</td>
                <td>{w.solved}</td>
                <td>{w.solved ? `${Math.round((w.correct / w.solved) * 100)}%` : '–'}</td>
                <td>{w.solved ? `${Math.round(w.avgMs / 1000)}초` : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

export function Records({ onBack, onStart }: { onBack(): void; onStart(): void }) {
  const [sum, setSum] = useState<RecordSummary | null>(null);
  const [weeks, setWeeks] = useState<WeekStat[]>([]);
  const [got, setGot] = useState<Set<string>>(new Set());
  const [maxCombo, setMaxCombo] = useState(0);
  const skills = loadSkills();

  useEffect(() => {
    recordSummary().then(setSum, () => setSum(null));
    history().then(
      (h) => {
        setWeeks(weekly(h.attempts, Date.now()));
        const typeIds = config.types.filter((t) => t.enabled).map((t) => t.id);
        setGot(unlockedIds(h, { skills: loadSkills(), typeIds }));
        setMaxCombo(Math.max(0, ...h.sessions.map((s) => s.maxCombo ?? 0)));
      },
      () => undefined,
    );
  }, []);

  return (
    <div className="screen records">
      <header className="bar-head">
        <button className="icon" onClick={onBack} aria-label="홈으로">
          ←
        </button>
        <div className="head-title">
          <span>기록</span>
        </div>
      </header>

      <main className="records-main">
        {sum && sum.total === 0 && (
          <div className="empty">
            <p className="muted">아직 푼 문제가 없어요. 풀기 시작하면 정답률이 오르는 모습과 업적이 여기에 쌓여요.</p>
            <button className="primary" onClick={onStart}>
              풀기 시작
            </button>
          </div>
        )}

        {sum && sum.total > 0 && (
          <>
            <div className="totals">
              <div>
                <b>{sum.total.toLocaleString()}</b>
                <span>푼 문제</span>
              </div>
              <div>
                <b>{pct({ solved: sum.total, wrong: sum.wrong })}%</b>
                <span>정답률</span>
              </div>
              <div>
                <b>{maxCombo}</b>
                <span>최고 콤보</span>
              </div>
            </div>

            <h2>주별 정답률</h2>
            {weeks.length > 0 && <Growth weeks={weeks} />}

            <h2>
              업적 <small>{got.size}/{ACHIEVEMENTS.length}</small>
            </h2>
            <ul className="achievements">
              {ACHIEVEMENTS.map((a) => (
                <li key={a.id} className={got.has(a.id) ? 'on' : ''}>
                  <b>
                    {got.has(a.id) ? '★' : '☆'} {a.label}
                  </b>
                  <span>{a.description}</span>
                </li>
              ))}
            </ul>

            <h2>
              유형별<small>정답률 낮은 순 — 여기부터 연습하면 빨리 늘어요</small>
            </h2>
            <Tally rows={sum.byType} label={(id) => typeLabel(config, id)} level={(id) => skillOf(skills, id).level} />

            <h2>묻는 방식별</h2>
            <Tally rows={sum.byKind} label={(k) => KIND_LABEL[k] ?? k} />

            <p className="muted small">이 기기에 저장된 기록 기준이에요. 동기화하면 다른 기기 기록도 합쳐져요.</p>
          </>
        )}
      </main>
    </div>
  );
}
