import { Fragment } from 'react';
import type { Item } from '../engine/item';
import { formatValue, isFrac, type Value } from '../engine/value';

function Term({ v }: { v: Value }) {
  if (isFrac(v)) {
    const [n, d] = formatValue(v).split('/');
    return (
      <span className="frac" aria-label={`${d}분의 ${n}`}>
        <span>{n}</span>
        <span>{d}</span>
      </span>
    );
  }
  return <>{formatValue(v)}</>;
}

interface Props {
  item: Item;
  revealed: boolean;
  correct: boolean;
  groupSeparator: boolean;
}

/** 수열 표시. 항이 많으면 자동 줄바꿈, 빈칸은 상자로 표시하고 공개 후 정답을 채운다. */
export function SequenceView({ item, revealed, correct, groupSeparator }: Props) {
  const size = item.terms.length >= 10 ? 'many' : item.terms.length >= 8 ? 'more' : '';
  return (
    <div className={`sequence ${size}`} role="text" aria-label="수열">
      {item.terms.map((t, i) => (
        <Fragment key={i}>
          {groupSeparator && item.groupSize && i > 0 && i % item.groupSize === 0 && (
            <span className="group-sep" aria-hidden />
          )}
          <span className={`term ${t === null ? `blank ${revealed ? (correct ? 'ok' : 'ng') : ''}` : ''}`}>
            {t === null ? revealed ? <Term v={item.answer} /> : '?' : <Term v={t} />}
          </span>
        </Fragment>
      ))}
    </div>
  );
}
