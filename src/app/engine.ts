/** 브라우저용 설정·문제은행 로더. 빌드 시 YAML이 번들에 포함된다 (private 은행은 포함하지 않음). */
import { bankToItem, parseBankFile } from '../engine/bank';
import { buildConfig, type EngineConfig } from '../engine/config';
import type { Item } from '../engine/item';
import { PLUGINS } from '../engine/plugins';
import { parseModes, type ModesFile } from '../game/modes';
import exam from '../../config/exam.yaml';
import modesRaw from '../../config/modes.yaml';

const typeFiles = import.meta.glob<unknown>('../../config/types/*.yaml', { eager: true, import: 'default' });
const bankFiles = import.meta.glob<unknown>('../../data/bank/public/*.yaml', { eager: true, import: 'default' });

function load(): { config: EngineConfig; bank: Item[]; modes: ModesFile } {
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
  const { modes, errors } = parseModes(modesRaw);
  if (!modes) throw new Error(`모드 설정 오류:\n${errors.join('\n')}`);
  return { config, bank, modes };
}

export const { config, bank, modes } = load();
