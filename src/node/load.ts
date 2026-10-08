/** Node(스크립트·테스트)용 설정/문제은행 로더. 브라우저는 src/app/engine.ts가 같은 역할을 한다. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { parseBankFile, type BankEntry, type Visibility } from '../engine/bank';
import { buildConfig, type ConfigResult } from '../engine/config';
import { PLUGINS } from '../engine/plugins';
import { parseModes } from '../game/modes';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const yamlFiles = (dir: string) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => /\.ya?ml$/.test(f))
        .sort()
        .map((f) => join(dir, f))
    : [];

const readYaml = (file: string): unknown => parse(readFileSync(file, 'utf8'));
const rel = (file: string) => relative(ROOT, file);

export function loadConfig(): ConfigResult {
  const exam = readYaml(join(ROOT, 'config/exam.yaml'));
  const types = yamlFiles(join(ROOT, 'config/types')).map((f) => ({ file: rel(f), data: readYaml(f) }));
  return buildConfig(exam, types, PLUGINS);
}

export const loadModes = () => parseModes(readYaml(join(ROOT, 'config/modes.yaml')));

export function loadBank(visibilities: Visibility[] = ['public', 'private']): {
  entries: BankEntry[];
  errors: string[];
} {
  const entries: BankEntry[] = [];
  const errors: string[] = [];
  for (const v of visibilities) {
    for (const f of yamlFiles(join(ROOT, 'data/bank', v))) {
      try {
        const r = parseBankFile(readYaml(f), rel(f), v);
        entries.push(...r.entries);
        errors.push(...r.errors);
      } catch (e) {
        errors.push(`${rel(f)}: YAML 파싱 실패 — ${(e as Error).message}`);
      }
    }
  }
  const ids = new Set<string>();
  for (const e of entries) {
    if (ids.has(e.id)) errors.push(`${e.file}: 중복된 문항 id "${e.id}"`);
    ids.add(e.id);
  }
  return { entries, errors };
}

/** 설정 오류가 있으면 출력 후 종료 (스크립트용) */
export function requireConfig() {
  const r = loadConfig();
  for (const w of r.warnings) console.warn(`⚠ ${w}`);
  if (!r.config) {
    for (const e of r.errors) console.error(`✗ ${e}`);
    process.exit(1);
  }
  return r.config;
}
