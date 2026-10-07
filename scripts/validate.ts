/**
 * 품질 게이트. 설정·생성기·문제은행을 바꾼 뒤 반드시 실행한다 (CI에서도 실행).
 *
 *   npm run validate              # 설정 + 전 유형 샘플 생성 검사 + 문제은행 검사
 *   npm run validate -- --type grouped --n 2000
 *   npm run validate:bank         # 문제은행만
 *
 * 실패 조건(종료 코드 1): 설정 오류, 생성기 자기 일관성 실패, 숫자 범위 위반,
 * 선택지 오류, 모호 문항, 성공률·중복률 기준 미달, 문제은행 오류.
 */
import { parseArgs } from 'node:util';
import { checkBankEntry } from '../src/engine/bank';
import { generateItem, inNumberRange, minRedundancyOf, type RejectReason } from '../src/engine/compose';
import type { Difficulty, EngineConfig, TypeConfig } from '../src/engine/config';
import { itemKey, type Item } from '../src/engine/item';
import { analyzeQuestion } from '../src/engine/question';
import { judge } from '../src/engine/solver';
import { eqNum, valueKey } from '../src/engine/value';
import { loadBank, requireConfig } from '../src/node/load';

const { values: args } = parseArgs({
  options: {
    type: { type: 'string' },
    n: { type: 'string' },
    'bank-only': { type: 'boolean', default: false },
  },
});

const failures: string[] = [];
const fail = (msg: string) => failures.push(msg);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** compose를 거쳐 나온 문항을 독립적으로 다시 검사 (compose 버그 방어) */
function recheck(item: Item, type: TypeConfig, config: EngineConfig): string[] {
  const problems: string[] = [];
  const q = item.question;
  const shown = item.terms.filter((t) => t !== null);
  // A·B 문항의 정답은 연산값이라 숫자 범위 대상이 아님
  const checked = q?.kind === 'pair' ? [...shown, ...(q.values ?? [])] : [...shown, item.answer];
  if (!checked.every((v) => inNumberRange(v, type))) problems.push('숫자 범위 위반');
  if (item.choices.length !== config.exam.choices) problems.push('선택지 개수 불일치');
  if (new Set(item.choices.map(valueKey)).size !== item.choices.length) problems.push('선택지 중복');
  if (item.choices.filter((c) => eqNum(c, item.answer)).length !== 1) problems.push('정답이 선택지에 1개가 아님');
  const extra = q?.kind === 'pair' ? { pairs: q.values ? [q.values] : [] } : q ? {} : { values: item.choices };
  const verdict = judge(
    analyzeQuestion(item.terms, q, extra),
    item.answer,
    minRedundancyOf(config, type),
    config.validation.altMinRedundancy,
  );
  if (!verdict.supporting.length) problems.push('정답 규칙 확인 실패');
  if (verdict.alternatives.length) {
    problems.push(`모호: ${verdict.alternatives.map((a) => `${a.familyId}→${valueKey(a.value)}`).join(', ')}`);
  }
  return problems;
}

function validateTypes(config: EngineConfig) {
  const n = Number(args.n ?? config.validation.sampleSizePerType);
  const types = config.types.filter((t) => (args.type ? t.id === args.type : t.enabled));
  if (args.type && !types.length) fail(`알 수 없는 유형: ${args.type}`);

  console.log(`\n■ 생성 검사 (유형당 ${n}문항, config v${config.version})\n`);
  console.log(
    ['유형', '난이도', '성공률', '평균시도', '중복률', '빈칸끝', '평균길이', '주요 기각 사유'].join('\t'),
  );

  for (const type of types) {
    const difficulties = Object.keys(type.difficulty).map(Number) as Difficulty[];
    for (const d of difficulties) {
      const count = Math.ceil(n / difficulties.length);
      const keys = new Set<string>();
      const rejects: Partial<Record<RejectReason, number>> = {};
      let ok = 0, attempts = 0, dup = 0, blankLast = 0, lengthSum = 0;
      for (let i = 0; i < count; i++) {
        const seed = (i + 1) * 2654435761 + d;
        const out = generateItem(config, { seed: seed >>> 0, typeId: type.id, difficulty: d });
        attempts += out.attempts;
        for (const [r, c] of Object.entries(out.rejects)) {
          rejects[r as RejectReason] = (rejects[r as RejectReason] ?? 0) + (c ?? 0);
        }
        if (!out.item) continue;
        ok++;
        const key = itemKey(out.item);
        if (keys.has(key)) dup++;
        keys.add(key);
        if (out.item.blankIndex === out.item.terms.length - 1) blankLast++;
        lengthSum += out.item.terms.length;
        const problems = recheck(out.item, type, config);
        if (problems.length) fail(`${out.item.id}: ${problems.join('; ')}`);
      }
      const success = ok / count;
      const dupRate = ok ? dup / ok : 0;
      const topRejects = Object.entries(rejects)
        .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
        .slice(0, 3)
        .map(([r, c]) => `${r}:${c}`)
        .join(' ');
      console.log(
        [
          type.id.padEnd(18),
          d,
          pct(success),
          (attempts / count).toFixed(1),
          pct(dupRate),
          pct(ok ? blankLast / ok : 0),
          (ok ? lengthSum / ok : 0).toFixed(1),
          topRejects,
        ].join('\t'),
      );
      if (rejects.self) fail(`${type.id} 난이도 ${d}: 생성기가 지정한 규칙과 수열이 불일치 (self ${rejects.self}회) — 생성기 버그`);
      if (success < config.validation.minSuccessRate) {
        fail(`${type.id} 난이도 ${d}: 성공률 ${pct(success)} < ${pct(config.validation.minSuccessRate)} — 파라미터 범위를 점검하세요`);
      }
      const maxDup = type.maxDuplicateRate ?? config.validation.maxDuplicateRate;
      if (dupRate > maxDup) {
        fail(`${type.id} 난이도 ${d}: 중복률 ${pct(dupRate)} > ${pct(maxDup)} — 파라미터 범위를 넓히세요`);
      }
    }
  }
}

function validateBank(config: EngineConfig) {
  const { entries, errors } = loadBank();
  errors.forEach(fail);
  const byVis = { public: 0, private: 0 };
  let warnings = 0;
  for (const e of entries) {
    byVis[e.visibility]++;
    const r = checkBankEntry(e, config);
    r.errors.forEach(fail);
    for (const w of r.warnings) {
      warnings++;
      console.warn(`  ⚠ ${w}`);
    }
  }
  console.log(`\n■ 문제은행: public ${byVis.public}문항, private ${byVis.private}문항 (경고 ${warnings}건)`);
}

const config = requireConfig();
const started = Date.now();
if (!args['bank-only']) validateTypes(config);
validateBank(config);

console.log(`\n(${((Date.now() - started) / 1000).toFixed(1)}s)`);
if (failures.length) {
  console.error(`\n✗ 실패 ${failures.length}건`);
  for (const f of failures.slice(0, 50)) console.error(`  - ${f}`);
  if (failures.length > 50) console.error(`  … 외 ${failures.length - 50}건`);
  process.exit(1);
}
console.log('\n✓ 모든 검사 통과');
