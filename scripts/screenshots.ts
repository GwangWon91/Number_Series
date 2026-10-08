/**
 * 화면 스크린샷 (Playwright): 모바일·PC × 라이트·다크로 주요 화면을 찍어 reports/screens/에 저장한다.
 * 빌드 결과를 vite preview로 띄우고, 실제로 문제를 풀며 이동한다. 기록 화면은 가짜 기록을 넣어 채운다.
 *
 *   npm run build && npm run screens
 *
 * 처음 한 번: npx playwright install chromium
 * 결과는 reports/(gitignore) — 커밋하지 않는다. [다음] 버튼 위치가 문제마다 같은지도 숫자로 확인해 출력한다.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type BrowserContextOptions, type Page } from 'playwright';
import { ROOT } from '../src/node/load';

const PORT = 4174;
const BASE = `http://localhost:${PORT}/`;
const OUT = join(ROOT, 'reports/screens');
mkdirSync(OUT, { recursive: true });

const DEVICES: Record<string, BrowserContextOptions> = {
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  pc: { viewport: { width: 1280, height: 800 } },
};
const THEMES = ['light', 'dark'] as const;

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
await new Promise<void>((resolve, reject) => {
  server.stdout.on('data', (d: Buffer) => d.toString().includes(String(PORT)) && resolve());
  server.on('exit', (code) => reject(new Error(`preview 종료 (${code})`)));
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 저장된 진행 상태에서 정답(또는 오답) 번호를 찾아 키보드로 고른다 */
async function answer(page: Page, right: boolean) {
  const i = await page.evaluate((right) => {
    const p = JSON.parse(localStorage.getItem('practice') ?? '{}');
    const k = p.item.choices.findIndex((c: unknown) => JSON.stringify(c) === JSON.stringify(p.item.answer));
    return right ? k : (k + 1) % p.item.choices.length;
  }, right);
  await page.keyboard.press(String(i + 1));
  await sleep(120);
}

/** 기록 화면을 채울 가짜 기록: 지난 8주, 여러 유형 */
async function seedHistory(page: Page) {
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((r) => {
      const q = indexedDB.open('skct-number-series');
      q.onsuccess = () => r(q.result);
    });
    const tx = db.transaction('attempts', 'readwrite');
    const st = tx.objectStore('attempts');
    const types = ['geometric', 'interleaved', 'rational', 'fraction', 'diff-arithmetic', 'grouped', 'linear-recurrence'];
    const W = 7 * 864e5;
    for (let w = 7; w >= 1; w--) {
      if (w === 4) continue; // 쉰 주
      for (let i = 0; i < 24; i++) {
        const t = types[i % types.length];
        const acc = 0.4 + (7 - w) * 0.07 + (types.indexOf(t) % 3) * 0.08;
        st.put({
          id: `seed-${w}-${i}`, ts: Date.now() - w * W + i * 1000, mode: 'all', typeId: t, difficulty: 1,
          configVersion: 0, terms: [2, 4, null, 8], answer: 6, choices: [5, 6, 7, 8, 9], chosen: 6,
          correct: (i % 10) / 10 < acc, elapsedMs: 15000 + (i % 5) * 4000, uploaded: 1, pooled: 1,
        });
      }
    }
    await new Promise((r) => (tx.oncomplete = r));
  });
}

const positions: string[] = [];

try {
  for (const [device, opts] of Object.entries(DEVICES)) {
    for (const theme of THEMES) {
      const browser = await chromium.launch();
      const ctx = await browser.newContext({ ...opts, colorScheme: theme, serviceWorkers: 'block' });
      const page = await ctx.newPage();
      const shot = (name: string, fullPage = false) =>
        page.screenshot({ path: join(OUT, `${device}-${theme}-${name}.png`), fullPage });
      const home = async () => {
        await page.goto(BASE);
        await page.waitForSelector('.home-main');
      };

      // 1. 첫 방문 안내 → 홈
      await home();
      await shot('01-home-intro', true);
      await page.click('.intro .button.ghost');
      await shot('02-home', true);

      // 2. 무제한 연습: 답하기 → 해설(정답) → 다음 → 해설(오답) — [다음] 위치 비교
      await page.click('.hero');
      await page.waitForSelector('.dock .choices');
      await shot('03-practice-answer');
      await answer(page, true);
      await shot('04-practice-reveal-ok');
      const y1 = await page.locator('.dock .button').boundingBox();
      await page.keyboard.press('Enter');
      await sleep(150);
      await answer(page, false);
      await shot('05-practice-reveal-ng');
      const y2 = await page.locator('.dock .button').boundingBox();
      positions.push(`${device}-${theme}: [다음] y=${y1?.y.toFixed(0)} → ${y2?.y.toFixed(0)}`);
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press('Enter');
        await sleep(150);
        await answer(page, i !== 1);
      }
      await page.keyboard.press('Escape');
      await page.waitForSelector('.summary-main');
      await sleep(500);
      await shot('06-summary-practice', true);

      // 3. 타임어택: 답한 직후 카드 테두리 피드백
      await page.click('.dock .button.ghost');
      await page.click('.mode-card:has-text("타임어택")');
      await page.waitForSelector('.q-card');
      await answer(page, true);
      await shot('07-time-attack-flash-ok');
      await sleep(500);
      await answer(page, false);
      await shot('08-time-attack-flash-ng');
      await page.keyboard.press('Escape');
      await page.waitForSelector('.summary-main');
      await sleep(500);
      await shot('09-summary-scored', true);

      // 4. 실전·서바이벌
      await page.click('.dock .button.ghost');
      await page.click('.mode-card:has-text("실전")');
      await page.waitForSelector('.q-card');
      await shot('10-exam');
      await answer(page, true);
      await page.keyboard.press('Escape');
      await page.waitForSelector('.summary-main');
      await page.click('.dock .button.ghost');
      await page.click('.mode-card:has-text("서바이벌")');
      await page.waitForSelector('.q-card');
      await answer(page, false);
      await shot('11-survival-reveal');
      await page.keyboard.press('Escape');
      await page.waitForSelector('.summary-main');
      await page.click('.dock .button.ghost');

      // 5. 기록 (가짜 기록 추가)
      await seedHistory(page);
      await page.click('[aria-label="기록 보기"]');
      await page.waitForSelector('.type-bars');
      await sleep(500);
      await shot('12-records', true);

      // 6. 설정 (초기화 확인 상태)
      await page.click('[aria-label="홈으로"]');
      await page.click('[aria-label="설정"]');
      await page.click('text=기록 초기화');
      await shot('13-settings-confirm', true);

      await browser.close();
    }
  }

} finally {
  server.kill();
}
console.log(`스크린샷 → ${OUT}`);
console.log(positions.join('\n'));
