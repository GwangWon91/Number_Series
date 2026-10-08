/**
 * 문제은행 분석 리포트: 회차·형식별 집계, 기출 유형·묻는 방식 비중 vs 설정 비중, 미분류·모호·중복 후보, 근거 커버리지.
 *   npm run analyze            # reports/bank-analysis.md 갱신 (gitignore — 커밋하지 않는다)
 *   npm run analyze -- --stdout
 * 문항 본문은 쓰지 않는다(집계와 id만). 그래도 기출 집계라 공개 저장소에 올리지 않는다 (reports/는 gitignore).
 * private은 CI에 없으므로 로컬 전용이다.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { bankToItem, checkBankEntry } from '../src/engine/bank';
import { valueKey } from '../src/engine/value';
import { loadBank, requireConfig, ROOT } from '../src/node/load';

const { values: args } = parseArgs({ options: { stdout: { type: 'boolean', default: false } } });
const config = requireConfig();
const { entries, errors } = loadBank();
/** 기출 비중과 설정 비중이 이만큼(%p) 벌어지면 점검 표시 */
const DRIFT_PP = 5;
// 유형별 근거 = 그 typeId를 적은 비공개 기출 문항 (공개 config에는 id를 두지 않는다)
const evidenceOf = (t: (typeof config.types)[number]) => [
  ...t.evidence,
  ...entries.filter((e) => e.visibility === 'private' && e.typeId === t.id).map((e) => e.id),
];

const count = <T>(xs: T[], key: (x: T) => string) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return m;
};
const fmtOf = (q: (typeof entries)[number]['question']) => (q?.kind === 'pair' ? 'pair' : q?.kind === 'nth' ? 'nth' : 'blank1');

const rows = entries.map((e) => {
  const check = checkBankEntry(e, config);
  const item = bankToItem(e, config);
  const warn = (re: RegExp) => check.warnings.some((w) => re.test(w));
  return {
    e,
    fmt: fmtOf(e.question),
    round: e.source.round ?? '(없음)',
    typeId: item.typeId,
    declared: !!e.typeId,
    unclassified: !check.families.length,
    thin: warn(/여유 항/),
    ambiguous: warn(/다른 해석/),
    key: `${e.terms.map((t) => (t === null ? '_' : String(t))).join(',')}=${valueKey(e.answer)}`,
  };
});

const table = (head: string[], body: (string | number)[][]) =>
  [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...body.map((r) => `| ${r.join(' | ')} |`)].join('\n');
const ids = (rs: typeof rows) => (rs.length ? rs.map((r) => r.e.id).join(', ') : '없음');

const rounds = [...new Set(rows.map((r) => r.round))].sort();
const fmts = ['blank1', 'pair', 'nth'];
const bankIds = new Set(entries.map((e) => e.id));
const out: string[] = [];

out.push(
  '# 문제은행 분석 리포트',
  '',
  '`npm run analyze`로 생성 (본문 없이 집계·id만). 새 회차를 넣을 때마다 다시 실행한다. 기출 집계라 공개 저장소에 올리지 않는다 (reports/는 gitignore).',
  `config v${config.version} · 은행 ${entries.length}문항 (public ${rows.filter((r) => r.e.visibility === 'public').length}, private ${rows.filter((r) => r.e.visibility === 'private').length}) · 로드 오류 ${errors.length}건`,
  '',
  '## 회차 × 문항 형식',
  table(['회차', ...fmts, '합계', '평균 난이도'], rounds.map((rd) => {
    const rs = rows.filter((r) => r.round === rd);
    const dif = rs.filter((r) => r.e.difficulty);
    return [rd, ...fmts.map((f) => rs.filter((r) => r.fmt === f).length), rs.length, dif.length ? (dif.reduce((s, r) => s + r.e.difficulty!, 0) / dif.length).toFixed(2) : '-'];
  })),
  '',
  '## 기출 유형 비중 vs 설정 생성 비중',
  `기출 = 비공개 은행 문항의 typeId (공개 변형은 기출에서 나온 것이라 세지 않는다). 차이가 ${DRIFT_PP}%p 이상이면 점검. 설정에 없는 행은 새 유형 후보.`,
  '',
);
const exam = rows.filter((r) => r.e.visibility === 'private');
const pct = (n: number, d: number) => (n / (d || 1)) * 100;
const drift = (a: number, b: number) => `${(a - b).toFixed(0)}${Math.abs(a - b) >= DRIFT_PP ? ' **점검**' : ''}`;
const isType = (id: string) => config.types.some((t) => t.id === id);
const typeIds = [...new Set([...config.types.map((t) => t.id), ...exam.map((r) => r.typeId)])];
const totalW = config.types.filter((t) => t.enabled).reduce((s, t) => s + t.weight, 0) || 1;
const byType = count(exam, (r) => r.typeId);
const kinds = config.exam.questions.kinds;
const totalK = Object.values(kinds).reduce((s, w) => s + (w ?? 0), 0) || 1;
const byFmt = count(exam, (r) => r.fmt);
out.push(
  table(['유형', '기출', '기출 %', '설정 %', '차이 %p', '근거 수준'], typeIds.map((id) => {
    const t = config.types.find((x) => x.id === id);
    const got = pct(byType.get(id) ?? 0, exam.length);
    const want = t?.enabled ? pct(t.weight, totalW) : 0;
    return [id, byType.get(id) ?? 0, got.toFixed(0), t?.enabled ? want.toFixed(0) : '-', t ? drift(got, want) : '후보', t?.confidence ?? '(설정 없음)'];
  })),
  '',
  '## 기출 묻는 방식 비중 vs 설정 (exam.questions.kinds)',
  table(['방식', '기출', '기출 %', '설정 %', '차이 %p'], (
    [['blank1', 'blank'], ['pair', 'pair'], ['nth', 'nth']] as const
  ).map(([fmt, kind]) => {
    const got = pct(byFmt.get(fmt) ?? 0, exam.length);
    const want = pct(kinds[kind] ?? 0, totalK);
    return [fmt, byFmt.get(fmt) ?? 0, got.toFixed(0), want.toFixed(0), drift(got, want)];
  })),
  '',
  '## 점검 대상',
  `- 미분류(규칙 판별 실패 → 새 규칙·유형 후보): ${ids(rows.filter((r) => r.unclassified))}`,
  `- 후보 유형(typeId가 설정에 없음 → 생성기 만들 때까지 변형 안 만듦): ${ids(exam.filter((r) => !isType(r.typeId)))}`,
  `- 정답 규칙 여유 항 부족: ${ids(rows.filter((r) => r.thin))}`,
  `- 다른 해석으로 다른 답이 나옴(모호): ${ids(rows.filter((r) => r.ambiguous))}`,
  `- typeId를 안 적은 기출 문항: ${ids(exam.filter((r) => !r.declared))}`,
);
const dupGroups = [...count(rows, (r) => r.key)].filter(([, n]) => n > 1);
out.push(
  `- 중복 후보(같은 수열·정답): ${dupGroups.length ? dupGroups.map(([k]) => rows.filter((r) => r.key === k).map((r) => r.e.id).join(' = ')).join('; ') : '없음'}`,
  '',
  '## 설정 근거 커버리지',
  `- 기출 근거 없는 활성 유형(confidence: estimated): ${config.types.filter((t) => t.enabled && t.confidence === 'estimated').map((t) => t.id).join(', ') || '없음'}`,
  `- 설정 evidence가 은행에 없는 id(오타·삭제): ${[...new Set(config.types.flatMap(evidenceOf))].filter((id) => !bankIds.has(id)).join(', ') || '없음'}`,
  `- 은행에 있지만 어떤 유형 evidence에도 안 쓰인 문항: ${(() => {
    const used = new Set(config.types.flatMap(evidenceOf));
    return ids(rows.filter((r) => r.e.visibility === 'private' && !used.has(r.e.id)));
  })()}`,
  '',
);

const text = out.join('\n');
if (args.stdout) console.log(text);
else {
  writeFileSync(join(ROOT, 'reports/bank-analysis.md'), text);
  console.log(`reports/bank-analysis.md 갱신 (${entries.length}문항) — 커밋하지 않는다`);
}
