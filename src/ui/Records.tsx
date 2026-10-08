import { Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { bank, config } from '../app/engine';
import { generateItem } from '../engine/compose';
import { typeLabel } from '../engine/config';
import { itemKey, type Item } from '../engine/item';
import { questionText } from '../engine/question';
import { skillOf } from '../game/adapt';
import { ACHIEVEMENTS, unlockedIds, weekly, type WeekStat } from '../game/progress';
import { history, recentWrong, recordSummary, type RecordSummary, type TallyRow } from '../store/records';
import type { Attempt } from '../store/types';
import { ExplainLines, Stars, TopBar } from './parts';
import { loadSkills } from './practiceState';
import { SequenceView, Term } from './SequenceView';

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
            {level && <Stars level={level(r.key)} />}
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

/**
 * 유형별 정답률 가로 막대 (계열 1개 → 범례 없음). 정답률 낮은 유형부터, 막대 끝에 값.
 * 마우스를 올리면 문제 수·평균 시간, 표로 보기 제공.
 */
function TypeBars({ rows, level }: { rows: TallyRow[]; level: (key: string) => number }) {
  return (
    <figure className="type-bars">
      <ul>
        {rows.map((r) => (
          <li key={r.key} title={`${typeLabel(config, r.key)}: 정답률 ${pct(r)}% · ${r.solved}문제 · 평균 ${Math.round(r.avgMs / 1000)}초`}>
            <span className="type-name">
              {typeLabel(config, r.key)}
              <Stars level={level(r.key)} />
            </span>
            <span className="bar-track" aria-hidden>
              <span className="bar-fill" style={{ width: `${Math.max(pct(r), 2)}%` }} />
            </span>
            <span className="bar-value">{pct(r)}%</span>
          </li>
        ))}
      </ul>
      <details>
        <summary>표로 보기</summary>
        <table>
          <thead>
            <tr>
              <th>유형</th>
              <th>정답률</th>
              <th>문제</th>
              <th>평균 시간</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{typeLabel(config, r.key)}</td>
                <td>{pct(r)}%</td>
                <td>{r.solved}</td>
                <td>{Math.round(r.avgMs / 1000)}초</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/**
 * 틀린 풀이에서 원래 문항을 되살린다 (해설을 보이려고). 은행 문항은 bankId로,
 * 생성 문항은 같은 출제 설정 버전일 때 seed로 다시 만들어 보이는 수열이 같을 때만.
 */
function restore(a: Attempt): Item | null {
  if (a.source === 'bank') return bank.find((b) => b.bankId === a.bankId) ?? null;
  if (a.seed === undefined || a.configVersion !== config.version) return null;
  const want = itemKey(a);
  // 출제 때 유형·난이도를 직접 정했는지에 따라 같은 seed라도 문항이 달라서 세 경우를 시도
  for (const spec of [{ typeId: a.typeId, difficulty: a.difficulty }, { typeId: a.typeId }, {}]) {
    const it = generateItem(config, { seed: a.seed, ...spec }).item;
    if (it && itemKey(it) === want) return it;
  }
  return null;
}

/** 최근 틀린 문제: 수열·정답·내 답, 되살릴 수 있으면 해설까지 */
function WrongReview() {
  const [limit, setLimit] = useState(10);
  const [rows, setRows] = useState<{ a: Attempt; item: Item | null }[] | null>(null);
  useEffect(() => {
    recentWrong(limit + 1).then((xs) => setRows(xs.map((a) => ({ a, item: restore(a) }))), () => setRows([]));
  }, [limit]);
  if (!rows) return null;
  if (!rows.length) return <p className="hint">아직 틀린 문제가 없어요.</p>;
  return (
    <div className="review">
      {rows.slice(0, limit).map(({ a, item }) => {
        const view = item ?? ({ ...a, explain: [], blankIndex: 0 } as unknown as Item);
        return (
          <article key={a.id} className="card">
            <p className="prompt">{questionText(a.question)}</p>
            <SequenceView item={view} revealed correct groupSeparator={view.groupSize !== undefined} />
            <p className="verdict">
              정답 <b><Term v={a.answer} /></b>
              <span className="muted">
                {' '}
                · 내 답 <Term v={a.chosen} /> · {md(a.ts)}
              </span>
            </p>
            {/* 되살리지 못한 문항도 증가·감소 규칙 요약은 기록만으로 보인다 */}
            <ExplainLines item={item ?? { ...a, explain: [] }} />
          </article>
        );
      })}
      {rows.length > limit && (
        <button className="button ghost" onClick={() => setLimit((n) => n + 10)}>
          더 보기
        </button>
      )}
    </div>
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
      <TopBar title="기록" onBack={onBack} backLabel="홈으로" />

      <main className="stack">
        {sum && sum.total === 0 && (
          <div className="empty">
            <p className="muted">아직 푼 문제가 없어요. 풀기 시작하면 정답률과 업적이 여기에 쌓여요.</p>
            <button className="button primary" onClick={onStart}>
              무제한 연습 시작
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
                <span>최고 연속</span>
              </div>
            </div>

            <section>
              <h2 className="section-title">
                유형별 정답률 <small>낮은 순 — 여기부터 연습하면 빨리 늘어요</small>
              </h2>
              <TypeBars rows={sum.byType} level={(id) => skillOf(skills, id).level} />
            </section>

            <section>
              <h2 className="section-title">틀린 문제 다시 보기</h2>
              <WrongReview />
            </section>

            <section>
              <h2 className="section-title">주별 정답률</h2>
              {weeks.length > 0 && <Growth weeks={weeks} />}
            </section>

            <section>
              <h2 className="section-title">
                업적 <small>{got.size}/{ACHIEVEMENTS.length}</small>
              </h2>
              <ul className="achievements">
                {ACHIEVEMENTS.map((a) => (
                  <li key={a.id} className={got.has(a.id) ? 'on' : ''}>
                    <b>
                      <Star aria-hidden className={got.has(a.id) ? 'on' : ''} /> {a.label}
                    </b>
                    <span>{a.description}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="section-title">묻는 방식별</h2>
              <Tally rows={sum.byKind} label={(k) => KIND_LABEL[k] ?? k} />
            </section>

            <p className="hint">이 기기에 저장된 기록 기준이에요.</p>
          </>
        )}
      </main>
    </div>
  );
}
