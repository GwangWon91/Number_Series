import { Flag, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { config } from '../app/engine';
import { loadGameUi, saveGameUi } from '../app/prefs';
import { ACHIEVEMENTS, unlockedIds, type Achievement } from '../game/progress';
import { SCORE_VERSION } from '../game/run';
import { questionText } from '../engine/question';
import { addFlag, bestScore, history, itemSnapshot, newId } from '../store/records';
import { FlagSheet } from './FlagSheet';
import { ExplainLines } from './parts';
import { modeOf, type SessionSummary } from './Practice';
import { loadSkills, type WrongEntry } from './practiceState';
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
export function Summary({ summary: { session, wrong, title, spec }, onContinue, onHome }: Props) {
  const mode = modeOf(spec);
  const [flagging, setFlagging] = useState<WrongEntry | null>(null);
  const [flagged, setFlagged] = useState<ReadonlySet<string>>(new Set());
  // undefined = 불러오는 중, null = 이전 기록 없음
  const [best, setBest] = useState<number | null | undefined>(undefined);
  const scored = session.score !== undefined;
  useEffect(() => {
    if (scored) bestScore(session.modeId, session.id, SCORE_VERSION).then(setBest, () => setBest(null));
  }, [scored, session.id, session.modeId]);

  // 이번 세션으로 새로 딴 업적 (한 번만 축하)
  const [fresh, setFresh] = useState<Achievement[]>([]);
  useEffect(() => {
    history().then(
      (h) => {
        const sessions = h.sessions.some((s) => s.id === session.id) ? h.sessions : [...h.sessions, session];
        const typeIds = config.types.filter((t) => t.enabled).map((t) => t.id);
        const got = unlockedIds({ attempts: h.attempts, sessions }, { skills: loadSkills(), typeIds });
        const ui = loadGameUi();
        const news = ACHIEVEMENTS.filter((a) => got.has(a.id) && !ui.seenAchievements.includes(a.id));
        if (!news.length) return;
        saveGameUi({ ...ui, seenAchievements: [...ui.seenAchievements, ...news.map((a) => a.id)] });
        setFresh(news);
      },
      () => undefined,
    );
  }, [session]);

  const score = session.score ?? 0;
  const isBest = best !== undefined && score > 0 && (best === null || score > best);
  const accuracy = Math.round((session.correct / session.total) * 100);

  return (
    <div className="screen summary">
      <main className="summary-main">
        <p className="muted">{title} 끝</p>
        {/* 점수 모드는 점수, 무제한 연습은 정답 수가 주인공 */}
        <p className="big-score">
          {scored ? score.toLocaleString() : `${session.correct}/${session.total}`}
          <span>{scored ? '점' : '정답'}</span>
        </p>
        {scored &&
          (isBest ? (
            <p className="best">
              <Trophy aria-hidden />
              {best === null ? '첫 기록!' : `최고 기록! (이전 ${best.toLocaleString()}점)`}
            </p>
          ) : (
            best != null && <p className="muted">최고 기록 {best.toLocaleString()}점</p>
          ))}

        {fresh.length > 0 && (
          <ul className="unlocked" aria-live="polite">
            {fresh.map((a) => (
              <li key={a.id}>
                <b>업적 달성 · {a.label}</b>
                <span className="muted"> {a.description}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="totals">
          {/* 무제한 연습은 큰 숫자가 이미 정답 수라 여기서는 정답률 */}
          <div>
            <b>{scored ? `${session.correct}/${session.total}` : `${accuracy}%`}</b>
            <span>{scored ? `정답 (${accuracy}%)` : '정답률'}</span>
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
                <span className="muted">{i + 1}구간</span> {c.correct}/10{scored && ` · ${c.score.toLocaleString()}점`}
              </li>
            ))}
          </ol>
        )}

        {wrong.length > 0 && (
          <section className="review">
            <h2 className="section-title">틀린 문제 다시 보기</h2>
            {wrong.map((w) => (
              <article key={w.attemptId} className="card">
                <p className="prompt">{questionText(w.item.question)}</p>
                <SequenceView item={w.item} revealed correct groupSeparator={w.item.groupSize !== undefined} />
                <ExplainLines item={w.item} />
                <button className="text-button flag" disabled={flagged.has(w.attemptId)} onClick={() => setFlagging(w)}>
                  <Flag aria-hidden />
                  {flagged.has(w.attemptId) ? '실전과 다름 표시함' : '실전과 다른가요?'}
                </button>
              </article>
            ))}
          </section>
        )}
      </main>

      <footer className="dock">
        <div className="button-row">
          <button className="button ghost" onClick={onHome}>
            홈
          </button>
          <button className="button primary grow" onClick={onContinue} autoFocus>
            {mode.items || mode.timeLimitSec || mode.lives ? '다시 하기' : '계속 풀기'}
          </button>
        </div>
      </footer>

      {flagging && (
        <FlagSheet
          reasons={config.feedback.reasons}
          onCancel={() => setFlagging(null)}
          onSave={async (reasons, note) => {
            await addFlag({ id: newId(), ts: Date.now(), attemptId: flagging.attemptId, ...itemSnapshot(flagging.item), reasons, note });
            setFlagged((s) => new Set(s).add(flagging.attemptId));
            setFlagging(null);
          }}
        />
      )}
    </div>
  );
}
