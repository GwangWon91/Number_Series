import { useEffect, useRef, useState } from 'react';

interface Props {
  /** 실전 기준 문항당 시간 (초) */
  limitSec: number;
  running: boolean;
  /** 정답 공개 후 멈춘 시간 */
  frozenMs?: number;
}

/** 경과 시간 + 속도 보너스 게이지: 기준 시간 동안 줄어들어 0이 되면 보너스 없음 (시간 제한은 아님). */
export function Timer({ limitSec, running, frozenMs }: Props) {
  const start = useRef(performance.now());
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(performance.now() - start.current), 250);
    return () => window.clearInterval(id);
  }, [running]);

  const ms = frozenMs ?? now;
  const left = Math.max(0, 1 - ms / (limitSec * 1000));
  return (
    <div className="timer" aria-label={`경과 ${Math.floor(ms / 1000)}초`} title="막대가 남아 있을 때 맞히면 속도 보너스">
      <span className="secs">{Math.floor(ms / 1000)}초</span>
      <span className="track">
        <span className="fill" style={{ transform: `scaleX(${left})` }} />
      </span>
    </div>
  );
}
