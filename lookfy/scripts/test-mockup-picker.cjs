#!/usr/bin/env node
// lookfy 시안 선택·하단 프롬프트 클립보드 테스트 (dcfy scripts/test-clipboard.cjs 방식 차용).
// 사용: node test-mockup-picker.cjs <허브 URL | 문서.html 경로>
//   파일 경로를 주면 그 폴더를 임시 로컬 http 서버(127.0.0.1, 운영체제가 고른 빈 포트)로 서빙해 보안 컨텍스트에서 시험하고 끝나면 닫는다.
// 시나리오(390 폭): ① 선택 클릭 → 프롬프트=클립보드 ② 다른 시안 클릭(단일: 하나만 / 복수: 둘 다) ③ 같은 버튼 재클릭 해제
//   ④ 의견 입력 300ms 디바운스(입력 직후엔 아직 이전 내용, 멈춘 뒤 복사) ⑤ 여러 줄 의견 ⑥ 전체 의견 ⑦ 새로고침 유지
//   ⑧ 하단 패널이 마지막 카드 버튼·입력·전체 의견을 가리지 않음(1280·390) ⑨ 접기/펼치기 ⑩ 초기화 ⑪ writeText 실패 시 execCommand 폴백.
// 끝나면 localStorage를 지운다(헤드리스 프로필은 매번 새로 만든다).
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

const arg = process.argv[2];
if (!arg) { console.error('usage: node test-mockup-picker.cjs <http(s) URL | file.html>'); process.exit(2); }

let chromium;
try { ({ chromium } = require(path.join(os.homedir(), '.cache/htmlfy-verify/node_modules/playwright-core'))); }
catch { console.error('playwright-core 없음: mkdir -p ~/.cache/htmlfy-verify && cd ~/.cache/htmlfy-verify && npm i playwright-core'); process.exit(2); }
function findExecutable() {
  const def = chromium.executablePath();
  if (fs.existsSync(def)) return def;
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  const dirs = fs.existsSync(cache) ? fs.readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => b.split('-')[1] - a.split('-')[1]) : [];
  for (const d of dirs) for (const sub of ['chrome-mac-arm64', 'chrome-mac'])
    for (const app of ['Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'Chromium.app/Contents/MacOS/Chromium']) {
      const p = path.join(cache, d, sub, app);
      if (fs.existsSync(p)) return p;
    }
  return undefined;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.css': 'text/css', '.js': 'text/javascript' };

function serveFile(file) {
  const root = path.dirname(path.resolve(file));
  const server = http.createServer((req, res) => {
    const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/${encodeURIComponent(path.basename(file))}` })));
}

(async () => {
  let server = null, url = arg;
  if (!/^https?:\/\//.test(arg)) {
    if (!fs.existsSync(arg)) { console.error('파일 없음: ' + arg); process.exit(2); }
    ({ server, url } = await serveFile(arg));
  }
  const browser = await chromium.launch({ executablePath: findExecutable() });
  const origin = new URL(url).origin;
  const results = [], errors = [];
  const push = (step, ok, extra) => results.push(Object.assign({ step, ok: !!ok }, extra || {}));

  const snap = (page) => page.evaluate(async () => ({
    clip: await navigator.clipboard.readText(),
    prompt: document.getElementById('mp-prompt').textContent,
    copyState: document.documentElement.getAttribute('data-copy-state'),
    pressed: [...document.querySelectorAll('[data-mp-sel][aria-pressed="true"]')].map((b) => b.getAttribute('data-mp-sel')),
    secure: window.isSecureContext,
  }));
  async function check(page, step, expect) {
    await sleep(150);
    const r = await snap(page);
    const lines = r.prompt.split('\n');
    const fmt = /^시안 선택 /.test(lines[0]) && lines[lines.length - 1] === '이 선택으로 진행해줘';
    const exp = expect ? expect(r) : true;
    push(step, r.clip === r.prompt && r.copyState === 'ok' && fmt && exp, { secure: r.secure, pressed: r.pressed, lines: lines.length, sample: lines.slice(1, 4) });
    return r;
  }

  // ---- 기본 경로 (390 폭) ----
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('dialog', (d) => d.accept());
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'load' });
  const info = await page.evaluate(() => ({ multi: window.__mockupPicker.meta.multi, ids: [...document.querySelectorAll('.mp-card[data-mp-id]')].map((c) => c.getAttribute('data-mp-id')) }));
  push('load', info.ids.length > 0, { cards: info.ids.length, multi: info.multi, loadMs: Date.now() - t0 });
  const [a, b2] = [info.ids[0], info.ids[1] || info.ids[0]];
  const last = info.ids[info.ids.length - 1];
  const sel = (id) => page.locator(`[data-mp-sel="${id}"]`);

  await sel(a).click();
  await check(page, 'select-first', (r) => r.pressed.join() === a && r.prompt.includes('\n선택: ' + a));
  await sel(b2).click();
  await check(page, info.multi ? 'select-second-multi' : 'select-second-single', (r) => info.multi ? r.pressed.length === 2 : r.pressed.join() === b2);
  await sel(b2).click();
  await check(page, 'toggle-off', (r) => !r.pressed.includes(b2) && (info.multi || r.prompt.includes('\n선택 없음\n')));
  if ((await sel(a).getAttribute('aria-pressed')) !== 'true') await sel(a).click(); else await page.click('#mp-copy');
  await check(page, 'reselect', (r) => r.pressed.includes(a));

  // 의견 디바운스: 선택하지 않은 마지막 시안에 의견
  const note = page.locator(`[data-mp-note="${last}"]`);
  await note.scrollIntoViewIfNeeded();
  const beforeClip = (await snap(page)).clip;
  await note.click();
  await note.pressSequentially('색이 좋아요', { delay: 20 });
  const mid = await snap(page);
  push('note-debounce-pending', mid.clip === beforeClip && mid.prompt !== beforeClip, { note: '입력 직후엔 아직 이전 클립보드' });
  await sleep(450);
  await check(page, 'note-debounced-copied', (r) => r.prompt.includes(`] 의견: 색이 좋아요`) && r.prompt.includes('[' + last));
  await note.press('Enter');
  await note.pressSequentially('버튼은 더 크게', { delay: 20 });
  await sleep(450);
  await check(page, 'note-multiline', (r) => r.prompt.includes('색이 좋아요\n    버튼은 더 크게'));
  const ov = page.locator('#mp-overall-note');
  await ov.click();
  await ov.pressSequentially('다음 라운드는 다크 모드도', { delay: 15 });
  await sleep(450);
  await check(page, 'overall-note', (r) => r.prompt.includes('\n전체 의견: 다음 라운드는 다크 모드도'));

  // 새로고침 유지
  const before = await page.locator('#mp-prompt').textContent();
  await page.reload({ waitUntil: 'load' });
  const after = await page.evaluate(() => ({ p: document.getElementById('mp-prompt').textContent, pressed: [...document.querySelectorAll('[data-mp-sel][aria-pressed="true"]')].length, ov: document.getElementById('mp-overall-note').value }));
  push('persist-after-reload', before === after.p && after.pressed >= 1 && after.ov.length > 0);

  // 패널 가림: 마지막 카드 버튼·의견 입력·전체 의견이 패널 위로 보이게 스크롤할 수 있는지(1280·390)
  async function notCovered(pg, vpName) {
    const r = await pg.evaluate(async (lastId) => {
      const panelTop = () => document.getElementById('mp-panel').getBoundingClientRect().top;
      const out = [];
      for (const sel of [`[data-mp-sel="${lastId}"]`, `[data-mp-note="${lastId}"]`, '#mp-overall-note', 'footer']) {
        const el = document.querySelector(sel); if (!el) continue;
        el.scrollIntoView({ block: 'end' });
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const rc = el.getBoundingClientRect();
        out.push({ sel, bottom: Math.round(rc.bottom), panelTop: Math.round(panelTop()), ok: rc.bottom <= panelTop() + 0.5 });
      }
      window.scrollTo(0, document.documentElement.scrollHeight);
      await new Promise((r) => requestAnimationFrame(r));
      const f = document.querySelector('footer').getBoundingClientRect();
      out.push({ sel: 'page-end', bottom: Math.round(f.bottom), panelTop: Math.round(panelTop()), ok: f.bottom <= panelTop() + 0.5 });
      return out;
    }, last);
    push('panel-not-covering-' + vpName, r.every((x) => x.ok), { checks: r });
  }
  await notCovered(page, 'mobile');

  // 접기/펼치기
  await page.click('#mp-toggle');
  const col = await page.evaluate(() => ({ hidden: getComputedStyle(document.getElementById('mp-prompt')).display === 'none', pad: parseInt(document.body.style.paddingBottom, 10), h: document.getElementById('mp-panel').offsetHeight }));
  await page.click('#mp-toggle');
  const exp = await page.evaluate(() => getComputedStyle(document.getElementById('mp-prompt')).display !== 'none');
  push('collapse-expand', col.hidden && col.pad === col.h + 16 && exp, col);

  // 초기화
  await page.click('#mp-reset');
  await check(page, 'reset', (r) => r.pressed.length === 0 && r.prompt.includes('\n선택 없음\n') && !r.prompt.includes('의견:'));
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await ctx.close();

  // 데스크톱 폭 가림 확인
  const ctxD = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pd = await ctxD.newPage();
  pd.on('pageerror', (e) => errors.push(String(e)));
  await pd.goto(url, { waitUntil: 'load' });
  await notCovered(pd, 'desktop');
  await ctxD.close();

  // ---- 폴백: writeText 거부 → execCommand('copy') ----
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx2.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  await ctx2.addInitScript(() => {
    const orig = navigator.clipboard; const readText = orig.readText.bind(orig);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('blocked')), readText } });
  });
  const p2 = await ctx2.newPage();
  p2.on('pageerror', (e) => errors.push(String(e)));
  await p2.goto(url, { waitUntil: 'load' });
  await p2.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await p2.reload({ waitUntil: 'load' });
  await p2.locator(`[data-mp-sel="${b2}"]`).click();
  await check(p2, 'fallback-execCommand', (r) => r.pressed.includes(b2));
  await p2.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await ctx2.close();

  await browser.close();
  if (server) server.close();
  const ok = results.every((r) => r.ok) && errors.length === 0;
  console.log(JSON.stringify({ ok, url, server: server ? 'temporary 127.0.0.1 (closed)' : 'given', results, consoleErrors: errors }, null, 2));
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
