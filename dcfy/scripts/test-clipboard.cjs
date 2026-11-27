#!/usr/bin/env node
// dcfy(구 decisionfy) 클립보드 테스트(2026-11-27 수동 복사 기준): 허브 URL(보안 컨텍스트)에서
//   선택·입력만으로는 클립보드가 바뀌지 않고(자동 복사 없음), '복사' 버튼을 눌러야 클립보드가 하단 프롬프트와 같아지는지 확인한다.
// 사용: node test-clipboard.cjs <허브 URL | 문서.html 경로>
//   허브 URL 예: http://127.0.0.1:8080/f/<project-id>/docs/reports/decisions/....html
//   파일 경로를 주면 그 폴더를 임시 로컬 http 서버(127.0.0.1, 빈 포트)로 서빙해 보안 컨텍스트에서 시험하고 끝나면 닫는다(허브 없어도 됨).
// 시나리오: ① 라디오 클릭 ② 메모 입력 ③ 체크박스 ④ 추천안 일괄 선택(각각 600ms 뒤에도 클립보드 불변 → '복사' 클릭 시 프롬프트와 일치) ⑤ 자동 복사 토글 부재·옛 저장 키 무시 ⑥ navigator.clipboard 실패 시 execCommand 폴백.
// 확정 항목(resolution)이 있으면: 입력 비활성(없음)·프롬프트 제외·추천 일괄 제외·localStorage 복원 제외도 확인한다(2026-11-20).
// 끝나면 localStorage를 지워 사용자의 선택에 영향을 주지 않는다(헤드리스 프로필은 매번 새로 만든다).
'use strict';
const path = require('path');
const fs = require('fs');

const arg = process.argv[2];
if (!arg) { console.error('usage: node test-clipboard.cjs <http(s) URL | file.html>'); process.exit(2); }

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
  const browser = await env.launchBrowser({ skill: 'dcfy' });
  const origin = new URL(url).origin;
  const results = [];
  const errors = [];

  // 자동 복사 없음: 클립보드에 표식을 쓰고 동작을 한 뒤 600ms 지나도 표식이 그대로여야 한다.
  let sn = 0;
  async function noAuto(page, name, action) {
    const mark = 'SENTINEL-' + (++sn);
    await page.evaluate((m) => navigator.clipboard.writeText(m), mark);
    await action();
    await sleep(600);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    results.push({ step: name, ok: clip === mark, clipboardUnchanged: clip === mark });
  }
  // 수동 복사: '복사' 버튼을 눌러 클립보드가 프롬프트와 같아지는지 확인
  async function check(page, name) {
    await page.click('#btn-copy');
    await sleep(150);
    const r = await page.evaluate(async () => ({
      clip: await navigator.clipboard.readText(),
      prompt: document.getElementById('prompt').textContent,
      copyState: document.documentElement.getAttribute('data-copy-state'),
      secure: window.isSecureContext,
    }));
    const ok = r.clip === r.prompt && r.copyState === 'ok';
    results.push({ step: name, ok, secure: r.secure, promptLines: r.prompt.split('\n').length, firstLine: r.prompt.split('\n')[0], sample: r.prompt.split('\n').slice(2, 3)[0] || '' });
    return ok;
  }

  // ---- 기본 경로: navigator.clipboard ----
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.reload({ waitUntil: 'load' });

  // 기본 접힘(2026-11-26): localStorage 없으면 접힘, 접힌 바 노출, 프롬프트 숨김
  const col = await page.evaluate(() => ({
    collapsed: document.getElementById('panel').classList.contains('collapsed'),
    expanded: document.getElementById('btn-toggle').getAttribute('aria-expanded'),
    promptVisible: document.getElementById('prompt').offsetParent !== null,
    copyVisible: document.getElementById('btn-copy').offsetParent !== null,
    status: document.getElementById('status').textContent,
    padOk: parseFloat(document.body.style.paddingBottom) >= document.getElementById('panel').offsetHeight,
  }));
  results.push({ step: 'default-collapsed', ok: col.collapsed && col.expanded === 'false' && !col.promptVisible && col.copyVisible && /응답 \d+건 · 미결 \d+건/.test(col.status) && col.padOk, ...col });

  // ⓪ 확정 항목(resolution) — 있으면 읽기 전용·프롬프트 제외 확인
  const resolvedIds = await page.$$eval('.dec[data-resolved]', (els) => els.map((e) => e.getAttribute('data-dec')));
  async function resolvedExcluded(name) {
    if (!resolvedIds.length) return;
    const r = await page.evaluate((ids) => {
      const prompt = document.getElementById('prompt').textContent;
      const enabled = ids.reduce((n, id) => n + [...document.querySelectorAll('#d-' + CSS.escape(id) + ' input, #d-' + CSS.escape(id) + ' textarea, #d-' + CSS.escape(id) + ' select')].filter((x) => !x.disabled).length, 0);
      const inPrompt = ids.filter((id) => prompt.split(/[\s,\[\]]+/).includes(id));
      return { enabled, inPrompt };
    }, resolvedIds);
    results.push({ step: name, ok: r.enabled === 0 && r.inPrompt.length === 0, resolved: resolvedIds.length, enabledInputs: r.enabled, inPrompt: r.inPrompt });
  }
  await resolvedExcluded('resolved-readonly-not-in-prompt');
  if (resolvedIds.length) {
    // localStorage에 확정 항목의 옛 선택이 남아 있어도 복원·프롬프트에 들어가지 않아야 한다.
    await page.evaluate((id) => {
      const k = window.__decisionDoc.storageKey; const s = JSON.parse(localStorage.getItem(k) || '{}');
      s[id] = { choice: '__hold', choices: [], custom: '', memo: '옛 메모', fields: {} }; localStorage.setItem(k, JSON.stringify(s));
    }, resolvedIds[0]);
    await page.reload({ waitUntil: 'load' });
    const leftover = await page.evaluate((id) => !!JSON.parse(localStorage.getItem(window.__decisionDoc.storageKey) || '{}')[id], resolvedIds[0]);
    await resolvedExcluded('resolved-not-restored');
    results[results.length - 1].ok = results[results.length - 1].ok && !leftover;
    results[results.length - 1].storageLeftover = leftover;
  }

  // 자동 복사 토글 부재 + 옛 저장 키가 남아 있어도 자동 복사 안 됨
  const tog = await page.evaluate(() => {
    const body = document.body.innerText;
    return {
      autoEls: document.querySelectorAll('[id*="auto" i]:not(#app), [data-auto-copy], input[type=checkbox][name*="auto" i], [role=switch]').length,
      autoText: /자동\s*복사|자동으로 복사|auto.?copy/i.test(body),
      autoKeys: Object.keys(localStorage).filter((k) => /auto/i.test(k)).length,
      togglePanelBtn: !!document.getElementById('btn-toggle'),
    };
  });
  results.push({ step: 'no-auto-copy-toggle', ok: tog.autoEls === 0 && !tog.autoText && tog.autoKeys === 0 && tog.togglePanelBtn, ...tog });
  await page.evaluate(() => { const k = window.__decisionDoc.storageKey; ['auto-copy', 'autocopy', 'auto', 'autoCopy'].forEach((x) => { try { localStorage.setItem(k + ':' + x, '1'); localStorage.setItem(k + ':' + x, 'on'); } catch {} }); });
  await page.reload({ waitUntil: 'load' });

  // 접힌 채로 선택해도 프롬프트 갱신(① 이후 check가 '복사' 클릭으로 검증). 이어서 펼치기 → 프롬프트 표시·키보드 토글.
  // ① 첫 single 결정의 첫 선택지(라벨 클릭 = 실제 사용자 동작)
  const radio = page.locator('.dec input[type=radio][data-kind=choice]').first();
  await noAuto(page, 'no-auto-copy-radio(stale-auto-keys-ignored)', () => radio.locator('xpath=ancestor::label[1]').click());
  await check(page, 'radio-click-manual-copy');

  await page.focus('#btn-toggle');
  await page.keyboard.press('Enter');
  const ex = await page.evaluate(() => ({
    expanded: document.getElementById('btn-toggle').getAttribute('aria-expanded'),
    promptVisible: document.getElementById('prompt').offsetParent !== null,
    stored: (() => { try { return localStorage.getItem(window.__decisionDoc.storageKey + ':panel-open'); } catch { return null; } })(),
    padOk: parseFloat(document.body.style.paddingBottom) >= document.getElementById('panel').offsetHeight,
  }));
  results.push({ step: 'expand-shows-prompt', ok: ex.expanded === 'true' && ex.promptVisible && ex.stored === '1' && ex.padOk, ...ex });

  // 직접 입력(2026-11-26): 옵션 카드 안 입력칸, 선택 시 포커스, 타이핑 시 자동 선택, 값 보존·복원
  const cust = page.locator('.dec:has(input[data-kind=custom])').first();
  if (await cust.count()) {
    const inside = await cust.evaluate((c) => { const i = c.querySelector('input[data-kind=custom]'); return !!i.closest('label.opt') && !!i.closest('label.opt').querySelector('input[data-kind=choice][value="__custom"]'); });
    await noAuto(page, 'no-auto-copy-custom-select', () => cust.locator('input[data-kind=choice][value="__custom"]').locator('xpath=ancestor::label[1]').locator('.opt-label').click());
    const foc = await cust.evaluate((c) => document.activeElement === c.querySelector('input[data-kind=custom]'));
    results.push({ step: 'custom-in-option-and-focus', ok: inside && foc, inside, focused: foc });
    await noAuto(page, 'no-auto-copy-custom-typing', () => page.keyboard.type('내 답'));
    await check(page, 'custom-typing-manual-copy');
    const other = cust.locator('input[type=radio][data-kind=choice]:not([value="__custom"])').first();
    if (await other.count()) {
      await other.locator('xpath=ancestor::label[1]').click();
      const out = await page.evaluate(() => document.getElementById('prompt').textContent.includes('내 답'));
      await cust.locator('input[data-kind=choice][value="__custom"]').locator('xpath=ancestor::label[1]').locator('.opt-label').click();
      await sleep(400);
      const back = await page.evaluate(() => document.getElementById('prompt').textContent.includes('직접 입력 "내 답"'));
      const val = await cust.locator('input[data-kind=custom]').inputValue();
      results.push({ step: 'custom-value-kept-not-in-prompt', ok: !out && back && val === '내 답', out, back, val });
      await other.locator('xpath=ancestor::label[1]').click();
      await cust.locator('input[data-kind=custom]').click();
      await page.keyboard.type('!');
      await sleep(450);
      const auto = await cust.locator('input[data-kind=choice][value="__custom"]').isChecked();
      results.push({ step: 'custom-typing-autoselects', ok: auto, auto });
      await check(page, 'custom-autoselect-manual-copy');
    }
  }

  // ② 메모 입력 → 자동 복사 없음, '복사' 클릭 시 복사
  const memo = page.locator('.dec [data-kind=memo]').first();
  await memo.click();
  await noAuto(page, 'no-auto-copy-memo', () => memo.pressSequentially('테스트 메모', { delay: 20 }));
  await check(page, 'memo-input-manual-copy');
  await memo.press('Enter');
  await memo.pressSequentially('둘째 줄', { delay: 20 });
  await check(page, 'memo-multiline');

  // ③ 체크박스(multi 결정이 있을 때)
  const cb = page.locator('.dec input[type=checkbox][data-kind=choice]').first();
  if (await cb.count()) { await noAuto(page, 'no-auto-copy-checkbox', () => cb.locator('xpath=ancestor::label[1]').click()); await check(page, 'checkbox-manual-copy'); }

  // ④ 추천안 일괄 선택
  await noAuto(page, 'no-auto-copy-recommended', () => page.click('#btn-rec'));
  await check(page, 'apply-recommended-manual-copy');
  await resolvedExcluded('resolved-excluded-from-recommended');

  // 선택 유지(localStorage) 확인: 새로고침 후 같은 프롬프트
  const before = await page.locator('#prompt').textContent();
  await page.reload({ waitUntil: 'load' });
  const after = await page.locator('#prompt').textContent();
  results.push({ step: 'persist-after-reload', ok: before === after });

  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await ctx.close();

  // ---- 폴백 경로: writeText 거부 → execCommand('copy') ----
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx2.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  await ctx2.addInitScript(() => {
    const orig = navigator.clipboard;
    const readText = orig.readText.bind(orig);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('blocked')), readText } });
  });
  const page2 = await ctx2.newPage();
  page2.on('pageerror', (e) => errors.push(String(e)));
  await page2.goto(url, { waitUntil: 'load' });
  await page2.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page2.reload({ waitUntil: 'load' });
  await page2.locator('.dec input[type=radio][data-kind=choice]').nth(1).locator('xpath=ancestor::label[1]').click();
  await check(page2, 'fallback-execCommand-manual-copy');
  await page2.evaluate(() => { try { localStorage.clear(); } catch {} });
  await ctx2.close();

  await browser.close();
  if (server) server.close();
  const ok = results.every((r) => r.ok) && errors.length === 0;
  console.log(JSON.stringify({ ok, url, server: server ? 'temporary 127.0.0.1 (closed)' : 'given', results, consoleErrors: errors }, null, 2));
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
