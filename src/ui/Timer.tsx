import { useEffect, useRef, useState } from 'react';

interface Props {
  /** 실전 기준 문항당 시간 (초) */
  limitSec: number;
  running: boolean;
  /** 정답 공개 후 멈춘 시간 */
  frozenMs?: number;
}

/** 경과 시간 + 기준 시간 대비 진행 막대. 기준을 넘으면 색이 바뀐다 (카운트다운은 아님). */
export function Timer({ limitSec, running, frozenMs }: Props) {
  const start = useRef(performance.now());
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(performance.now() - start.current), 250);
    return () => window.clearInterval(id);
  }, [running]);

  const ms = frozenMs ?? now;
  const ratio = Math.min(1, ms / (limitSec * 1000));
  const over = ms > limitSec * 1000;
  return (
    <div className={`timer ${over ? 'over' : ''}`} aria-label={`경과 ${Math.floor(ms / 1000)}초`}>
      <span className="secs">{Math.floor(ms / 1000)}초</span>
      <span className="track">
        <span className="fill" style={{ transform: `scaleX(${ratio})` }} />
      </span>
    </div>
  );
}
