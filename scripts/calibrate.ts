/**
 * 보정 근거 집계. 앱에서 내보낸 기록(data/feedback/*.json)을 유형별로 모아
 * 정답률·풀이 시간·'실전과 다름' 사유를 보여 주고 설정 조정 후보를 제안한다.
 * 제안만 할 뿐 설정 파일은 고치지 않는다 — 판단과 수정은 사람이 한다.
 *
 *   npm run calibrate
 *   npm run calibrate -- --since-version 2     # 특정 설정 버전 이후 기록만
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { formatValue } from '../src/engine/value';
import { requireConfig, ROOT } from '../src/node/load';
import type { Attempt, ExportFile, Flag } from '../src/store/types';

const { values: args } = parseArgs({ options: { 'since-version': { type: 'string' } } });
const sinceVersion = Number(args['since-version'] ?? 0);

const config = requireConfig();
const dir = join(ROOT, 'data/feedback');
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
if (!files.length) {
  console.log('data/feedback/에 내보낸 JSON이 없습니다. 앱 설정 → 기록과 피드백 → 내보내기로 받아 넣으세요.');
  process.exit(0);
}

// 여러 기기·여러 번 내보낸 파일을 id 기준으로 합친다
const attempts = new Map<string, Attempt>();
const flags = new Map<string, Flag>();
for (const f of files) {
  const data = JSON.parse(readFileSync(join(dir, f), 'utf8')) as ExportFile;
  for (const a of data.attempts ?? []) if (a.configVersion >= sinceVersion) attempts.set(a.id, a);
  for (const x of data.flags ?? []) if (x.configVersion >= sinceVersion) flags.set(x.id, x);
}

const reasonLabel = new Map(config.feedback.reasons.map((r) => [r.id, r.label]));
const typeLabel = (id: string) => config.types.find((t) => t.id === id)?.label ?? id;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const pct = (x: number) => `${Math.round(x * 100)}%`;

console.log(`\n■ 집계 대상: 파일 ${files.length}개 · 풀이 ${attempts.size}건 · 표시 ${flags.size}건 (config v${sinceVersion || 1} 이후, 현재 v${config.version})\n`);
console.log(['유형', '풀이', '정답률', '시간 중앙값', '표시', '주요 사유'].join('\t'));

const limitMs = config.exam.timePerItemSec * 1000;
const suggestions: string[] = [];
const typeIds = [...new Set([...attempts.values()].map((a) => a.typeId))].sort();

for (const typeId of typeIds) {
  const as = [...attempts.values()].filter((a) => a.typeId === typeId);
  const fs = [...flags.values()].filter((f) => f.typeId === typeId);
  const acc = as.filter((a) => a.correct).length / as.length;
  const med = median(as.map((a) => a.elapsedMs));
  const reasons = new Map<string, number>();
  for (const f of fs) for (const r of f.reasons) reasons.set(r, (reasons.get(r) ?? 0) + 1);
  const top = [...reasons].sort((a, b) => b[1] - a[1]);
  console.log(
    [
      typeLabel(typeId).padEnd(16),
      as.length,
      pct(acc),
      `${(med / 1000).toFixed(0)}초`,
      fs.length,
      top.slice(0, 3).map(([r, c]) => `${reasonLabel.get(r) ?? r} ${c}`).join(', '),
    ].join('\t'),
  );

  const share = (r: string) => (reasons.get(r) ?? 0) / Math.max(as.length, 1);
  const file = `config/types/${typeId}.yaml`;
  const enough = as.length >= 10;
  if (share('numbers-too-big') >= 0.1) suggestions.push(`${file}: 숫자가 크다는 표시가 많음 → numbers.max 또는 difficulty의 start/ratio 범위 축소`);
  if (share('numbers-too-small') >= 0.1) suggestions.push(`${file}: 숫자가 작다는 표시가 많음 → difficulty 범위 확대`);
  if (share('unfamiliar-rule') >= 0.1) suggestions.push(`${file}: '실전에 없는 규칙' 표시가 많음 → weight 축소 또는 enabled: false 검토`);
  if (share('wrong-length') >= 0.1) suggestions.push(`${file}: 항 개수가 다르다는 표시 → length 조정 (validate로 모호성 재확인 필수)`);
  if (share('odd-choices') >= 0.1) suggestions.push(`config/exam.yaml: ${typeId} 선택지가 어색하다는 표시 → exam.distractors 가중치 조정`);
  if (share('too-easy') >= 0.1 || (enough && acc >= 0.95 && med < limitMs * 0.5)) {
    suggestions.push(`${file}: 실전보다 쉬움 (정답률 ${pct(acc)}, ${(med / 1000).toFixed(0)}초) → 난이도 1 비중 축소 또는 파라미터 상향`);
  }
  if (share('too-hard') >= 0.1 || (enough && med > limitMs * 1.5)) {
    suggestions.push(`${file}: 실전보다 어려움 (시간 중앙값 ${(med / 1000).toFixed(0)}초 > 기준 ${config.exam.timePerItemSec}초) → 난이도 3 비중 축소`);
  }
}

if (flags.size) {
  console.log(`\n■ '실전과 다름' 표시 문항 (최근 20건)\n`);
  for (const f of [...flags.values()].sort((a, b) => b.ts - a.ts).slice(0, 20)) {
    const q = f.question;
    const seq =
      f.terms.map((t, i) => (t === null ? (q?.kind === 'pair' ? (q.blanks[0] === i ? 'A' : 'B') : '?') : formatValue(t))).join(', ') +
      (q?.kind === 'pair' ? ` (A ${q.op} B)` : q?.kind === 'nth' ? ` … ${q.n}번째` : '');
    const why = f.reasons.map((r) => reasonLabel.get(r) ?? r).join(', ');
    console.log(`- [${typeLabel(f.typeId)}] ${seq} (정답 ${formatValue(f.answer)}) — ${why}${f.note ? ` / "${f.note}"` : ''}`);
    console.log(`    재현: typeId=${f.typeId} difficulty=${f.difficulty} seed=${f.seed ?? '-'} config v${f.configVersion}`);
  }
}

console.log(`\n■ 조정 후보 ${suggestions.length ? '' : '없음'}`);
for (const s of suggestions) console.log(`- ${s}`);
console.log('\n조정 후: exam.yaml version +1, changelog 기록 → npm run validate → npm test → 커밋 (docs/calibration.md)');
