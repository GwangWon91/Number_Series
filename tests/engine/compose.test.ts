import { describe, expect, it } from 'vitest';
import { generateItem } from '../../src/engine/compose';
import { eqValue } from '../../src/engine/value';
import { loadConfig } from '../../src/node/load';

const { config, errors } = loadConfig();

describe('설정', () => {
  it('저장소의 설정 파일이 스키마를 통과한다', () => {
    expect(errors).toEqual([]);
    expect(config).not.toBeNull();
  });
});

describe('문항 생성', () => {
  it('같은 seed는 같은 문항을 만든다 (플래그 재현용)', () => {
    const a = generateItem(config!, { seed: 42 }).item;
    const b = generateItem(config!, { seed: 42 }).item;
    expect(a).toEqual(b);
  });

  it.each(config!.types.map((t) => t.id))('%s: 정답 1개를 포함한 선택지와 해설', (typeId) => {
    for (let seed = 1; seed <= 20; seed++) {
      const item = generateItem(config!, { seed, typeId }).item!;
      expect(item).not.toBeNull();
      expect(item.terms.filter((t) => t === null)).toHaveLength(1);
      expect(item.terms[item.blankIndex]).toBeNull();
      expect(item.choices).toHaveLength(config!.exam.choices);
      expect(item.choices.filter((c) => eqValue(c, item.answer))).toHaveLength(1);
      expect(item.explain.length).toBeGreaterThan(0);
    }
  });
});
