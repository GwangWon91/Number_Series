import { describe, expect, it } from 'vitest';
import { bankToItem } from '../../src/engine/bank';
import { loadBank, requireConfig } from '../../src/node/load';

describe('공개 문제은행', () => {
  it('모든 문항이 설정에 있는 유형으로 기록된다 (기록 화면에 solver 계열 id가 나오지 않게)', () => {
    const config = requireConfig();
    const { entries, errors } = loadBank(['public']);
    expect(errors).toEqual([]);
    const known = new Set(config.types.map((t) => t.id));
    const stray = entries.filter((e) => !known.has(bankToItem(e, config).typeId)).map((e) => e.id);
    expect(stray).toEqual([]);
  });
});
