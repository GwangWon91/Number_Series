/** 여러 화면이 함께 쓰는 작은 조각: 아이콘 버튼, 머리말, 해설 줄, 숙련 별 */
import { ChevronLeft, Star } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Item } from '../engine/item';
import { ruleSummary } from '../engine/question';

/** 아이콘만 있는 버튼 — 이름은 aria-label로, 터치 영역은 --tap */
export function IconButton({ label, onClick, children, className = '' }: {
  label: string;
  onClick(): void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button className={`icon-button ${className}`} onClick={onClick} aria-label={label} title={label}>
      {children}
    </button>
  );
}

/** 하위 화면 머리말: ← + 제목 (+ 오른쪽 조각) */
export function TopBar({ title, sub, onBack, backLabel = '뒤로', children }: {
  title: ReactNode;
  sub?: ReactNode;
  onBack(): void;
  backLabel?: string;
  children?: ReactNode;
}) {
  return (
    <header className="topbar">
      <IconButton label={backLabel} onClick={onBack}>
        <ChevronLeft aria-hidden />
      </IconButton>
      <div className="topbar-title">
        <h1>{title}</h1>
        {sub && <span className="topbar-sub">{sub}</span>}
      </div>
      {children}
    </header>
  );
}

/** 해설: 증가·감소 규칙이면 첫 줄에 굵게 요약, 이어서 해설 줄들 */
export function ExplainLines({ item }: { item: Pick<Item, 'terms' | 'answer' | 'question' | 'explain'> }) {
  const summary = ruleSummary(item);
  return (
    <>
      {summary && (
        <p className="rule-summary">
          <b>규칙: {summary}</b>
        </p>
      )}
      {/* 은행 문항은 사람이 쓴 규칙 줄과 자동 해설 첫 줄이 같을 수 있다 → 바로 앞 줄과 같으면 뺀다 */}
      {item.explain.map((line, i) =>
        i > 0 && line.replace(/\s+/g, '') === item.explain[i - 1].replace(/\s+/g, '') ? null : (
          <p key={i} className={i === 0 ? 'rule-name' : 'rule-line'}>
            {line}
          </p>
        ),
      )}
    </>
  );
}

/** 숙련 단계 1~3 */
export function Stars({ level, max = 3 }: { level: number; max?: number }) {
  return (
    <span className="stars" aria-label={`숙련 ${level}단계`} role="img">
      {Array.from({ length: max }, (_, i) => (
        <Star key={i} aria-hidden className={i < level ? 'on' : ''} />
      ))}
    </span>
  );
}
