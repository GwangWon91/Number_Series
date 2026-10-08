import { useState } from 'react';

interface Props {
  reasons: { id: string; label: string }[];
  onSave(reasons: string[], note: string): void;
  onCancel(): void;
}

/** '실전과 다름' 사유 선택 시트. 사유 목록은 config/exam.yaml의 feedback.reasons에서 온다. */
export function FlagSheet({ reasons, onSave, onCancel }: Props) {
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div className="sheet" role="dialog" aria-label="실전과 다른 점" onClick={(e) => e.stopPropagation()}>
        <h2>실전과 어떤 점이 다른가요?</h2>
        <div className="chips">
          {reasons.map((r) => (
            <button key={r.id} className={picked.includes(r.id) ? 'chip on' : 'chip'} onClick={() => toggle(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
        <textarea
          placeholder="메모 (선택) — 예: 실전은 항이 5개였음"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
        />
        <div className="button-row">
          <button className="button ghost" onClick={onCancel}>
            취소
          </button>
          <button className="button primary grow" disabled={!picked.length && !note.trim()} onClick={() => onSave(picked, note.trim())}>
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
