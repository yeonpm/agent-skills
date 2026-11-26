#!/usr/bin/env node
// htmlfy 검증: 데스크톱(1280)·휴대폰(390) 폭에서 콘솔 오류, 외부 요청, 가로 넘침을 확인하고 스크린샷 1장을 저장한다.
// 사용: node verify.cjs <문서.html> [스크린샷.png]
// playwright-core 위치: ~/.cache/htmlfy-verify (없으면 SKILL.md의 설치 명령 실행)
const path = require('path');
const fs = require('fs');
const os = require('os');

const html = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !fs.existsSync(html)) {
  console.error('usage: node verify.cjs <file.html> [shot.png]');
  process.exit(2);
}
const shot = path.resolve(process.argv[3] || html.replace(/\.html?$/i, '.png'));

let chromium;
try {
  ({ chromium } = require(path.join(os.homedir(), '.cache/htmlfy-verify/node_modules/playwright-core')));
} catch {
  console.error('playwright-core 없음: mkdir -p ~/.cache/htmlfy-verify && cd ~/.cache/htmlfy-verify && npm i playwright-core');
  process.exit(2);
}

// 기본 브라우저가 없으면 캐시에 있는 가장 최신 Chromium을 사용한다.
function findExecutable() {
  const def = chromium.executablePath();
  if (fs.existsSync(def)) return def;
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  const dirs = fs.existsSync(cache)
    ? fs.readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => b.split('-')[1] - a.split('-')[1])
    : [];
  for (const d of dirs) {
    for (const sub of ['chrome-mac-arm64', 'chrome-mac']) {
      for (const app of ['Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'Chromium.app/Contents/MacOS/Chromium']) {
        const p = path.join(cache, d, sub, app);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return undefined;
}

(async () => {
  const browser = await chromium.launch({ executablePath: findExecutable() });
  const url = 'file://' + html;
  const results = [];
  for (const vp of [{ name: 'desktop', width: 1280, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const errors = [];
    const external = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('request', (r) => { if (!/^(file|data|blob|about):/.test(r.url())) external.push(r.url()); });
    await page.goto(url, { waitUntil: 'load' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (vp.name === 'mobile') await page.screenshot({ path: shot, fullPage: false });
    results.push({ viewport: vp.name, consoleErrors: errors, externalRequests: external, horizontalOverflowPx: overflow });
    await page.close();
  }
  await browser.close();
  const ok = results.every((r) => r.consoleErrors.length === 0 && r.externalRequests.length === 0 && r.horizontalOverflowPx <= 0);
  console.log(JSON.stringify({ ok, screenshot: shot, results }, null, 2));
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
