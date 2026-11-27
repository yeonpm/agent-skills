#!/usr/bin/env node
// htmlfy 검증: 데스크톱(1280)·휴대폰(390) 폭에서 콘솔 오류, 외부 요청, 가로 넘침을 확인하고 스크린샷 1장을 저장한다.
// 사용: node verify.cjs <문서.html> [스크린샷.png]
// playwright-core·브라우저 위치는 lib/skills-env.cjs가 찾는다(설정 playwrightModule·browserExecutable, 진단: doctor.cjs).
const path = require('path');
const fs = require('fs');

const html = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !fs.existsSync(html)) {
  console.error('usage: node verify.cjs <file.html> [shot.png]');
  process.exit(2);
}
const shot = path.resolve(process.argv[3] || html.replace(/\.html?$/i, '.png'));

const env = require('./lib/skills-env.cjs');

(async () => {
  const browser = await env.launchBrowser({ skill: 'htmlfy' });
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
