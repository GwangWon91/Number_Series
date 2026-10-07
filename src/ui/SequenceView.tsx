import { Fragment } from 'react';
import type { Item } from '../engine/item';
import { formatValue, isFrac, type Value } from '../engine/value';

/** 값 하나 표시: 분수는 세로, 대분수는 정수 + 세로 분수, 소수·정수는 그대로 */
export function Term({ v }: { v: Value }) {
  const s = formatValue(v);
  if (!isFrac(v) || v.fmt === 'dec' || !s.includes('/')) return <>{s}</>;
  const [whole, f] = s.includes(' ') ? s.split(' ') : ['', s];
  const [n, d] = f.split('/');
  return (
    <span className="mixed" aria-label={`${whole ? `${whole}과 ` : ''}${d}분의 ${n}`}>
      {whole}
      <span className="frac" aria-hidden>
        <span>{n}</span>
        <span>{d}</span>
      </span>
    </span>
  );
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
