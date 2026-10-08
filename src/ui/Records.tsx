import { useEffect, useState } from 'react';
import { config } from '../app/engine';
import { typeLabel } from '../engine/config';
import { recordSummary, type RecordSummary, type TallyRow } from '../store/records';

const KIND_LABEL: Record<string, string> = { blank: '빈칸 1개', pair: 'A, B 두 빈칸', nth: 'n번째 수 묻기' };

function Tally({ rows, label }: { rows: TallyRow[]; label: (key: string) => string }) {
  return (
    <ul className="tally">
      {rows.map((r) => (
        <li key={r.key}>
          <span className="name">{label(r.key)}</span>
          <span className="count">
            {r.solved}문제 중 <b>{r.wrong}</b>문제 틀림
          </span>
          {/* 초록 바탕 위에 틀린 비율만큼 빨강 */}
          <span className="bar" aria-hidden>
            <span style={{ width: `${(r.wrong / r.solved) * 100}%` }} />
          </span>
          <span className="avg">평균 {Math.round(r.avgMs / 1000)}초</span>
        </li>
      ))}
    </ul>
  );
}

export function Records({ onBack, onStart }: { onBack(): void; onStart(): void }) {
  const [sum, setSum] = useState<RecordSummary | null>(null);
  useEffect(() => {
    recordSummary().then(setSum, () => setSum(null));
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
            <p className="muted">아직 푼 문제가 없어요. 풀기 시작하면 유형별로 몇 문제 틀렸는지 여기에 쌓여요.</p>
            <button className="primary" onClick={onStart}>
              풀기 시작
            </button>
          </div>
        )}

        {sum && sum.total > 0 && (
          <>
            <div className="totals">
              <div>
                <b>{sum.total}</b>
                <span>푼 문제</span>
              </div>
              <div className="ng">
                <b>{sum.wrong}</b>
                <span>틀린 문제</span>
              </div>
              <div>
                <b>{Math.round(((sum.total - sum.wrong) / sum.total) * 100)}%</b>
                <span>정답률</span>
              </div>
            </div>

            <h2>
              유형별<small>틀린 비율이 높은 순</small>
            </h2>
            <Tally rows={sum.byType} label={(id) => typeLabel(config, id)} />

            <h2>묻는 방식별</h2>
            <Tally rows={sum.byKind} label={(k) => KIND_LABEL[k] ?? k} />

            <p className="muted small">이 기기에 저장된 기록 기준이에요. 동기화하면 다른 기기 기록도 합쳐져요.</p>
          </>
        )}
      </main>
    </div>
  );
}
