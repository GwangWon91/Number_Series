/**
 * 생성 문항을 대량으로 뽑아 HTML 리포트로 만든다. 실전 문항과 나란히 놓고 검토하는 용도.
 *
 *   npm run sample                          # 유형마다 20문항
 *   npm run sample -- --type grouped --n 60
 *   npm run sample -- --compare             # 문제은행(public+private)과 나란히 비교 + 형식 통계
 *
 * 출력: reports/sample-<시각>.html (gitignore 대상 — 기출 원문이 들어갈 수 있음)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { bankToItem } from '../src/engine/bank';
import { generateItem } from '../src/engine/compose';
import type { Difficulty } from '../src/engine/config';
import type { Item } from '../src/engine/item';
import { formatValue } from '../src/engine/value';
import { loadBank, requireConfig, ROOT } from '../src/node/load';
import { formatStats, type FormatStats } from '../src/node/stats';

const { values: args } = parseArgs({
  options: {
    type: { type: 'string' },
    difficulty: { type: 'string' },
    n: { type: 'string', default: '20' },
    compare: { type: 'boolean', default: false },
    seed: { type: 'string', default: String(Date.now() % 100000) },
    out: { type: 'string' },
  },
});

const config = requireConfig();
const n = Number(args.n);
const seedBase = Number(args.seed);
const types = config.types.filter((t) => (args.type ? t.id === args.type : t.enabled));
const bankItems = args.compare ? loadBank().entries.map((e) => ({ entry: e, item: bankToItem(e, config) })) : [];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const totalWeight = config.types.filter((t) => t.enabled).reduce((s, t) => s + t.weight, 0);

function seqHtml(it: Item) {
  return it.terms.map((t) => (t === null ? '<b class="q">?</b>' : esc(formatValue(t)))).join('<span class="sep">, </span>');
}

function itemHtml(it: Item, tag = '') {
  return `<li><div class="seq">${seqHtml(it)}</div>
  <div class="meta">${tag}선택지 ${it.choices.map((c) => esc(formatValue(c))).join(' · ')} → <b>${esc(formatValue(it.answer))}</b>
  <span class="dim">(난이도 ${it.difficulty}${it.seed !== undefined ? `, seed ${it.seed}` : ''})</span></div>
  <div class="rule">${it.explain.map(esc).join('<br>')}</div></li>`;
}

function statsRow(label: string, s: FormatStats) {
  return `<tr><td>${label}</td><td>${s.count}</td><td>${s.avgLength.toFixed(1)}</td><td>${pct(s.blankLastRate)}</td>
  <td>${s.medianMaxAbs}</td><td>${s.maxAbs}</td><td>${pct(s.negativeRate)}</td><td>${s.medianChoiceSpread.toFixed(2)}</td></tr>`;
}

const sections: string[] = [];
const summary: string[] = [];
for (const type of types) {
  const diffs = args.difficulty
    ? [Number(args.difficulty) as Difficulty]
    : (Object.keys(type.difficulty).map(Number) as Difficulty[]);
  const generated: Item[] = [];
  for (let i = 0; i < n; i++) {
    const item = generateItem(config, { seed: seedBase + i * 7919, typeId: type.id, difficulty: diffs[i % diffs.length] }).item;
    if (item) generated.push(item);
  }
  const bank = bankItems.filter((b) => b.item.typeId === type.id);
  const genStats = formatStats(generated);
  const bankStats = formatStats(bank.map((b) => b.item));
  summary.push(`<tr><td>${esc(type.label)}<br><span class="dim">${type.id}</span></td>
    <td>${pct(type.weight / totalWeight)}</td><td>${type.confidence}</td>
    ${args.compare ? `<td>${bank.length}</td>` : ''}</tr>`);

  sections.push(`<section><h2>${esc(type.label)} <span class="dim">${type.id} · 비중 ${pct(type.weight / totalWeight)} · ${type.confidence}</span></h2>
  <table class="stats"><tr><th></th><th>문항</th><th>평균 항수</th><th>빈칸 끝</th><th>최대값 중앙</th><th>최대값</th><th>음수 포함</th><th>선택지 폭</th></tr>
  ${statsRow('생성', genStats)}${args.compare ? statsRow('은행', bankStats) : ''}</table>
  <div class="cols">
    <div><h3>생성 문항</h3><ol>${generated.map((it) => itemHtml(it)).join('')}</ol></div>
    ${args.compare ? `<div><h3>문제은행 (${bank.length})</h3><ol>${bank.map((b) => itemHtml(b.item, `<span class="tag ${b.entry.visibility}">${b.entry.visibility}</span> `)).join('') || '<p class="dim">없음</p>'}</ol></div>` : ''}
  </div></section>`);
}

let unmatched = '';
if (args.compare) {
  const known = new Set(config.types.map((t) => t.id));
  const rest = bankItems.filter((b) => !known.has(b.item.typeId));
  if (rest.length) {
    unmatched = `<section><h2>유형 미분류 은행 문항 (${rest.length}) <span class="dim">새 유형 후보</span></h2>
    <ol>${rest.map((b) => itemHtml(b.item, `<span class="tag">${esc(b.entry.file)}</span> `)).join('')}</ol></section>`;
  }
}

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>수열추리 샘플 리포트</title><style>
:root{--bg:#fff;--fg:#111;--dim:#777;--line:#e4e4e4;--accent:#2563eb}
@media (prefers-color-scheme:dark){:root{--bg:#111;--fg:#eee;--dim:#888;--line:#2a2a2a;--accent:#60a5fa}}
body{background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,sans-serif;max-width:1200px;margin:0 auto;padding:16px}
h1{font-size:20px}h2{font-size:16px;margin-top:32px;border-top:1px solid var(--line);padding-top:16px}h3{font-size:13px;color:var(--dim)}
.dim{color:var(--dim);font-weight:normal;font-size:12px}.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px}
ol{padding-left:20px}li{margin-bottom:12px}.seq{font:16px ui-monospace,monospace;font-variant-numeric:tabular-nums}.q{color:var(--accent)}
.sep{color:var(--dim)}.meta{font-size:12px}.rule{font-size:12px;color:var(--dim)}
table{border-collapse:collapse;font-size:12px}td,th{border:1px solid var(--line);padding:4px 8px;text-align:right}td:first-child{text-align:left}
.tag{font-size:11px;border:1px solid var(--line);border-radius:4px;padding:0 4px}.tag.private{color:#dc2626}
</style></head><body>
<h1>수열추리 샘플 리포트</h1>
<p class="dim">config v${config.version} · ${new Date().toLocaleString('ko-KR')} · 유형당 ${n}문항 · seed ${seedBase}</p>
<table><tr><th>유형</th><th>출제 비중</th><th>근거</th>${args.compare ? '<th>은행 문항</th>' : ''}</tr>${summary.join('')}</table>
${sections.join('')}${unmatched}
</body></html>`;

const out = args.out ?? join(ROOT, 'reports', `sample-${new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '')}.html`);
mkdirSync(join(ROOT, 'reports'), { recursive: true });
writeFileSync(out, html);
console.log(`리포트 생성: ${relative(process.cwd(), out)}`);
