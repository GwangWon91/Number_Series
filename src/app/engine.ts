/** 브라우저용 설정·문제은행 로더. 빌드 시 YAML이 번들에 포함된다 (private 은행은 포함하지 않음). */
import { bankToItem, parseBankFile } from '../engine/bank';
import { buildConfig, type EngineConfig } from '../engine/config';
import type { Item } from '../engine/item';
import { PLUGINS } from '../engine/plugins';
import exam from '../../config/exam.yaml';

const typeFiles = import.meta.glob<unknown>('../../config/types/*.yaml', { eager: true, import: 'default' });
const bankFiles = import.meta.glob<unknown>('../../data/bank/public/*.yaml', { eager: true, import: 'default' });

function load(): { config: EngineConfig; bank: Item[] } {
  const result = buildConfig(
    exam,
    Object.entries(typeFiles).map(([file, data]) => ({ file, data })),
    PLUGINS,
  );
  if (!result.config) throw new Error(`설정 오류:\n${result.errors.join('\n')}`);
  const config = result.config;
  const bank = Object.entries(bankFiles).flatMap(([file, raw]) =>
    parseBankFile(raw, file, 'public').entries.map((e) => bankToItem(e, config)),
  );
  return { config, bank };
}

export const { config, bank } = load();
