import { describe, expect, it } from 'vitest';
import { pickNextItem, nearestDifficulty } from '../../src/engine/session';
import { skillOf, updateSkill, weakWeights, type TypeSkill } from '../../src/game/adapt';
import { loadConfig } from '../../src/node/load';

const play = (s: TypeSkill, answers: boolean[]) => answers.reduce(updateSkill, s);

describe('updateSkill', () => {
  it('최근 6문제 중 5문제 맞히면 한 단계 올라가고 기록을 비운다', () => {
    expect(play(skillOf({}, 'x'), [true, true, false, true, true, true])).toEqual({ level: 2, recent: [] });
  });
  it('5문제 중 3문제 틀리면 내려가고, 1단계 아래로는 안 내려간다', () => {
    expect(play({ level: 2, recent: [] }, [false, true, false, true, false])).toEqual({ level: 1, recent: [] });
    expect(play({ level: 1, recent: [] }, [false, false, false, false, false]).level).toBe(1);
  });
  it('3단계 위로는 안 올라간다', () => {
    expect(play({ level: 3, recent: [] }, Array(6).fill(true)).level).toBe(3);
  });
});

describe('weakWeights', () => {
  const enabled = new Set(['a', 'b', 'c', 'd', 'e']);
  it('3문제 이상 푼 유형 중 오답률 상위 3개', () => {
    const w = weakWeights(
      [
        { key: 'a', solved: 10, wrong: 8 },
        { key: 'b', solved: 10, wrong: 1 },
        { key: 'c', solved: 2, wrong: 2 },
        { key: 'd', solved: 5, wrong: 3 },
        { key: 'e', solved: 4, wrong: 2 },
        { key: 'gone', solved: 9, wrong: 9 },
      ],
      enabled,
    );
    expect(Object.keys(w!).sort()).toEqual(['a', 'd', 'e']);
  });
  it('기록이 부족하면 null', () => {
    expect(weakWeights([{ key: 'a', solved: 2, wrong: 2 }], enabled)).toBeNull();
  });
});

describe('pickNextItem 옵션', () => {
  const { config } = loadConfig();
  it('정의된 난이도 중 단계에 가장 가까운 것', () => {
    expect(nearestDifficulty(1, [2, 3])).toBe(2);
    expect(nearestDifficulty(3, [1, 2])).toBe(2);
    expect(nearestDifficulty(2, [1, 2, 3])).toBe(2);
  });
  it('적응형: 유형별 단계를 난이도로, 약점: 가중치 유형만', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const item = pickNextItem(config!, [], {
        typeId: null,
        recentKeys: new Set(),
        seed,
        typeWeights: { geometric: 1, interleaved: 2 },
        levelOf: () => 3,
      });
      expect(['geometric', 'interleaved']).toContain(item.typeId);
      expect(item.difficulty).toBe(3);
    }
  });
});
