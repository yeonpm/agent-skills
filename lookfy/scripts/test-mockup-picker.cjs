#!/usr/bin/env node
// lookfy 시안 선택·하단 프롬프트 클립보드 테스트(2026-11-27 수동 복사 기준; dcfy scripts/test-clipboard.cjs 방식 차용).
//   선택·입력만으로는 클립보드가 바뀌지 않고(자동 복사 없음, 600ms 이상 확인), '복사' 버튼을 눌러야 클립보드=프롬프트가 되는지 확인한다.
// 사용: node test-mockup-picker.cjs <허브 URL | 문서.html 경로>
//   파일 경로를 주면 그 폴더를 임시 로컬 http 서버(127.0.0.1, 운영체제가 고른 빈 포트)로 서빙해 보안 컨텍스트에서 시험하고 끝나면 닫는다.
// 시나리오(390 폭): ① 선택 클릭 → 프롬프트=클립보드 ② 다른 시안 클릭(단일: 하나만 / 복수: 둘 다) ③ 같은 버튼 재클릭 해제
//   ④ 의견 입력(자동 복사 없음 확인 후 복사 버튼) ⑤ 여러 줄 의견 ⑥ 전체 의견 ⑦ 새로고침 유지
//   ⑧ 하단 패널이 마지막 카드 버튼·입력·전체 의견을 가리지 않음(1280·390) ⑨ 접기/펼치기 ⑩ 초기화 ⑪ writeText 실패 시 execCommand 폴백.
// 끝나면 localStorage를 지운다(헤드리스 프로필은 매번 새로 만든다).
'use strict';
const path = require('path');
const fs = require('fs');

const arg = process.argv[2];
if (!arg) { console.error('usage: node test-mockup-picker.cjs <http(s) URL | file.html>'); process.exit(2); }

let env;
try { env = require(path.join(__dirname, '..', '..', 'htmlfy', 'scripts', 'lib', 'skills-env.cjs')); }
catch (e) { console.error('htmlfy 스킬이 이 스킬과 같은 폴더(예: ~/.claude/skills/htmlfy)에 있어야 한다: ' + e.message); process.exit(2); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let server = null, url = arg;
  if (!/^https?:\/\//.test(arg)) {
    if (!fs.existsSync(arg)) { console.error('파일 없음: ' + arg); process.exit(2); }
    ({ server, url } = await env.serveFile(arg));
  }
  const browser = await env.launchBrowser({ skill: 'lookfy' });
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
  // 자동 복사 없음: 클립보드에 표식을 쓰고 action 뒤 600ms가 지나도 표식이 그대로여야 한다.
  let sn = 0;
  async function noAuto(page, step, action) {
    const mark = 'SENTINEL-' + (++sn);
    await page.evaluate((m) => navigator.clipboard.writeText(m), mark);
    await action();
    await sleep(600);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    push(step, clip === mark, { clipboardUnchanged: clip === mark });
  }
  // 수동 복사: '복사' 버튼을 눌러 클립보드=프롬프트인지 확인
  async function check(page, step, expect) {
    await page.click('#mp-copy');
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

  // 자동 복사·토글·안내 문구 없음
  const tg = await page.evaluate(() => ({ els: document.querySelectorAll('[id*="auto" i], [data-auto-copy], [role=switch]').length, text: /자동\s*복사|자동으로 복사/.test(document.body.innerText) }));
  push('no-auto-copy-toggle-or-text', tg.els === 0 && !tg.text, tg);
  await noAuto(page, 'no-auto-copy-select', () => sel(a).click());
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
  await note.click();
  await noAuto(page, 'no-auto-copy-note', () => note.pressSequentially('색이 좋아요', { delay: 20 }));
  await check(page, 'note-manual-copy', (r) => r.prompt.includes(`] 의견: 색이 좋아요`) && r.prompt.includes('[' + last));
  await note.press('Enter');
  await note.pressSequentially('버튼은 더 크게', { delay: 20 });
  await check(page, 'note-multiline', (r) => r.prompt.includes('색이 좋아요\n    버튼은 더 크게'));
  const ov = page.locator('#mp-overall-note');
  await ov.click();
  await noAuto(page, 'no-auto-copy-overall-note', () => ov.pressSequentially('다음 라운드는 다크 모드도', { delay: 15 }));
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
  await noAuto(page, 'no-auto-copy-reset', () => page.click('#mp-reset'));
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
  await check(p2, 'fallback-execCommand-manual-copy', (r) => r.pressed.includes(b2));
  await p2.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await ctx2.close();

  await browser.close();
  if (server) server.close();
  const ok = results.every((r) => r.ok) && errors.length === 0;
  console.log(JSON.stringify({ ok, url, server: server ? 'temporary 127.0.0.1 (closed)' : 'given', results, consoleErrors: errors }, null, 2));
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
