import { describe, expect, it } from 'vitest';
import { generateItem } from '../../src/engine/compose';
import { applyPairOp } from '../../src/engine/question';
import { eqNum } from '../../src/engine/value';
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
      const kind = item.question?.kind;
      const blanks = kind === 'pair' ? 2 : kind === 'nth' ? 0 : 1;
      expect(item.terms.filter((t) => t === null)).toHaveLength(blanks);
      if (blanks) expect(item.terms[item.blankIndex]).toBeNull();
      expect(item.choices).toHaveLength(config!.exam.choices);
      expect(item.choices.filter((c) => eqNum(c, item.answer))).toHaveLength(1);
      expect(item.explain.length).toBeGreaterThan(0);
    }
  });

  const only = (kind: 'pair' | 'nth') => ({
    ...config!,
    exam: { ...config!.exam, questions: { ...config!.exam.questions, kinds: { [kind]: 1 }, pairOps: { '+': 1, '×': 1, '−': 1, '/': 1 } } },
  });

  it('A·B 문항: 빈칸 2개, 정답 = A ○ B, 정답 선택지 1개', () => {
    const cfg = only('pair');
    let made = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const item = generateItem(cfg, { seed, typeId: 'diff-arithmetic' }).item;
      if (!item) continue;
      made++;
      const q = item.question!;
      expect(q.kind).toBe('pair');
      if (q.kind !== 'pair') continue;
      expect(item.terms.filter((t) => t === null)).toHaveLength(2);
      expect(q.blanks.map((b) => item.terms[b])).toEqual([null, null]);
      expect(eqNum(applyPairOp(q.op, ...q.values!)!, item.answer)).toBe(true);
      expect(item.choices.filter((c) => eqNum(c, item.answer))).toHaveLength(1);
    }
    expect(made).toBeGreaterThan(30);
  });

  it('n번째 항 문항: 보이는 항 뒤의 n번째, 빈칸 없음', () => {
    const cfg = only('nth');
    for (let seed = 1; seed <= 20; seed++) {
      const item = generateItem(cfg, { seed, typeId: 'arithmetic' }).item!;
      const q = item.question!;
      expect(q.kind).toBe('nth');
      if (q.kind !== 'nth') continue;
      expect(item.terms.includes(null)).toBe(false);
      expect(q.n).toBeGreaterThan(item.terms.length);
      const [a, b] = item.terms as number[];
      expect(item.answer).toBe(a + (b - a) * (q.n - 1));
      expect(item.choices.filter((c) => eqNum(c, item.answer))).toHaveLength(1);
    }
  });
});
