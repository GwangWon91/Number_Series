import { describe, expect, it } from 'vitest';
import { buildConfig } from '../../src/engine/config';
import { PLUGINS } from '../../src/engine/plugins';

describe('설정 검증', () => {

  it('생성기에 대응하는 설정 파일이 없으면 오류', () => {
    const r = buildConfig({}, [], PLUGINS);
    expect(r.config).toBeNull();
    expect(r.errors.some((e) => e.includes('config/types/arithmetic.yaml'))).toBe(true);
  });

  it('난이도 파라미터가 생성기 스키마와 다르면 오류', () => {
    const r = buildConfig(
      {},
      [
        {
          file: 'x.yaml',
          data: {
            id: 'arithmetic', label: 'x', enabled: true, weight: 1, confidence: 'estimated',
            length: [6, 7], blank: { last: 1, middle: 0 }, numbers: { min: 0, max: 99 },
            difficulty: { '1': { start: [1, 5] } },
          },
        },
      ],
      PLUGINS,
    );
    expect(r.errors.some((e) => e.includes('x.yaml difficulty.1'))).toBe(true);
  });
});
