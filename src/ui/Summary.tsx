import { useEffect, useState } from 'react';
import { config } from '../app/engine';
import { typeLabel } from '../engine/config';
import { questionText } from '../engine/question';
import { bestScore } from '../store/records';
import type { SessionSummary } from './Practice';
import { SequenceView } from './SequenceView';

interface Props {
  summary: SessionSummary;
  onContinue(): void;
  onHome(): void;
}

const clock = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** 세션 요약: 점수·최고 기록 비교·구간별 결과·틀린 문제 다시 보기 → 계속 풀기 */
export function Summary({ summary: { session, wrong }, onContinue, onHome }: Props) {
  // undefined = 불러오는 중, null = 이전 기록 없음
  const [best, setBest] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    bestScore(session.modeId, session.id).then(setBest, () => setBest(null));
  }, [session.id, session.modeId]);

  const score = session.score ?? 0;
  const isBest = best !== undefined && score > 0 && (best === null || score > best);
  const accuracy = Math.round((session.correct / session.total) * 100);

  return (
    <div className="screen summary">
      <main className="summary-main">
        <p className="muted">{session.modeId === 'all' ? '전체 무작위' : typeLabel(config, session.modeId)} 세션 끝</p>
        <p className="big-score">
          {score.toLocaleString()}
          <span>점</span>
        </p>
        {isBest ? (
          <p className="best">{best === null ? '첫 기록!' : `최고 기록! (이전 ${best.toLocaleString()}점)`}</p>
        ) : (
          best != null && <p className="muted small">최고 기록 {best.toLocaleString()}점</p>
        )}

        <div className="totals">
          <div>
            <b>
              {session.correct}/{session.total}
            </b>
            <span>정답 ({accuracy}%)</span>
          </div>
          <div>
            <b>{session.maxCombo ?? 0}</b>
            <span>최고 콤보</span>
          </div>
          <div>
            <b>{clock(session.durationMs)}</b>
            <span>시간</span>
          </div>
        </div>

        {session.checkpoints && session.checkpoints.length > 1 && (
          <ol className="segments" aria-label="구간별 결과">
            {session.checkpoints.map((c, i) => (
              <li key={i}>
                <span className="muted">{i + 1}구간</span> {c.correct}/10 · {c.score.toLocaleString()}점
              </li>
            ))}
          </ol>
        )}

        {wrong.length > 0 && (
          <section className="review">
            <h2>틀린 문제 다시 보기</h2>
            {wrong.map((item, i) => (
              <article key={i}>
                <p className="prompt">{questionText(item.question)}</p>
                <SequenceView item={item} revealed correct groupSeparator={item.groupSize !== undefined} />
                {item.explain.map((line, j) => (
                  <p key={j} className={j === 0 ? 'rule-name' : 'rule-line'}>
                    {line}
                  </p>
                ))}
              </article>
            ))}
          </section>
        )}
      </main>

      <footer className="dock summary-actions">
        <button className="primary wide" onClick={onContinue} autoFocus>
          계속 풀기
        </button>
        <button className="ghost" onClick={onHome}>
          홈
        </button>
      </footer>
    </div>
  );
}
