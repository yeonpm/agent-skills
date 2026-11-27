#!/usr/bin/env node
// lookfy 시안 문서 검사: 시안 영역(.fp-stage) 안 글자 넘침(HTML 요소 scroll>client, SVG text가 viewBox 밖)을 항상 세고,
// 포인트 버튼(.fp-btn)이 있으면 1280·390 폭에서 모두 눌러 강조 표시·위치·Esc 해제·재클릭·키보드(Enter)를 확인한다.
// 버튼이 있으면 휴대폰 폭 강조 스크린샷 1장 저장. 버튼이 없으면 넘침 검사만 한다(포인트 버튼은 필요한 경우에만, 2026-11-25).
// 사용: node check-focus.cjs <문서.html> [강조스크린샷.png]
const path = require('path');
const fs = require('fs');

const html = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !fs.existsSync(html)) {
  console.error('usage: node check-focus.cjs <file.html> [focus-shot.png]');
  process.exit(2);
}
const shot = path.resolve(process.argv[3] || html.replace(/\.html?$/i, '-focus.png'));

let env;
try { env = require(path.join(__dirname, '..', '..', 'htmlfy', 'scripts', 'lib', 'skills-env.cjs')); }
catch (e) { console.error('htmlfy 스킬이 이 스킬과 같은 폴더(예: ~/.claude/skills/htmlfy)에 있어야 한다: ' + e.message); process.exit(2); }

const state = (page, id) => page.evaluate((id) => {
  const act = [...document.querySelectorAll('.fp-area.fp-active')];
  const btn = document.querySelector(`.fp-btn[data-target="${id}"]`);
  const a = act[0];
  if (!a) return { active: 0, pressed: btn && btn.getAttribute('aria-pressed') };
  const st = a.closest('.fp-stage');
  const ar = a.getBoundingClientRect(), sr = st.getBoundingClientRect();
  return {
    active: act.length, id: a.dataset.focus, pressed: btn.getAttribute('aria-pressed'),
    stageOn: st.classList.contains('fp-on'), opacity: getComputedStyle(a).opacity,
    inside: ar.left >= sr.left - 1 && ar.top >= sr.top - 1 && ar.right <= sr.right + 1 && ar.bottom <= sr.bottom + 1 && ar.width > 4 && ar.height > 4,
    visible: ar.bottom > 0 && ar.top < innerHeight,
  };
}, id);

(async () => {
  const browser = await env.launchBrowser({ skill: 'lookfy' });
  const results = [];
  for (const vp of [{ name: 'desktop', width: 1280, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('file://' + html, { waitUntil: 'load' });
    const meta = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('.fp-btn[data-target]')].map((b) => b.dataset.target);
      const areas = [...document.querySelectorAll('.fp-area[data-focus]')].map((a) => a.dataset.focus);
      const overflow = [];
      document.querySelectorAll('.fp-stage').forEach((st) => {
        st.querySelectorAll('*').forEach((el) => {
          if (el.closest('svg') || el.classList.contains('fp-area')) return;
          if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible') overflow.push('html:' + (el.textContent || '').trim().slice(0, 30));
        });
        st.querySelectorAll('svg').forEach((svg) => {
          const vb = svg.viewBox.baseVal;
          if (!vb || !vb.width) return;
          svg.querySelectorAll('text').forEach((t) => {
            const b = t.getBBox();
            if (b.x < vb.x - 0.5 || b.y < vb.y - 0.5 || b.x + b.width > vb.x + vb.width + 0.5 || b.y + b.height > vb.y + vb.height + 0.5) overflow.push('svg:' + t.textContent.slice(0, 30));
          });
        });
      });
      return { btns, areas, missingArea: btns.filter((b) => !areas.includes(b)), orphanArea: areas.filter((a) => !btns.includes(a)), overflow };
    });
    const fails = [];
    for (const id of meta.btns) {
      await page.click(`.fp-btn[data-target="${id}"]`);
      await page.waitForTimeout(80);
      const s = await state(page, id);
      if (!(s.active === 1 && s.id === id && s.pressed === 'true' && s.stageOn && s.opacity === '1' && s.inside && s.visible)) fails.push({ id, step: 'click', s });
      await page.keyboard.press('Escape');
      const e = await state(page, id);
      if (!(e.active === 0 && e.pressed === 'false')) fails.push({ id, step: 'esc', e });
    }
    if (meta.btns.length) {
      const id = meta.btns[0];
      await page.click(`.fp-btn[data-target="${id}"]`);
      await page.click(`.fp-btn[data-target="${id}"]`);
      const t = await state(page, id);
      if (t.active !== 0) fails.push({ id, step: 'toggle', t });
      await page.focus(`.fp-btn[data-target="${id}"]`);
      await page.keyboard.press('Enter');
      const k = await state(page, id);
      if (k.active !== 1) fails.push({ id, step: 'keyboard-enter', k });
      if (vp.name === 'mobile') await page.screenshot({ path: shot });
      await page.keyboard.press('Escape');
    }
    results.push({ viewport: vp.name, buttons: meta.btns.length, areas: meta.areas.length, missingArea: meta.missingArea, orphanArea: meta.orphanArea, textOverflow: meta.overflow, consoleErrors: errors, fails });
    await page.close();
  }
  await browser.close();
  const ok = results.every((r) => !r.missingArea.length && !r.orphanArea.length && !r.textOverflow.length && !r.consoleErrors.length && !r.fails.length);
  console.log(JSON.stringify({ ok, screenshot: results.some((r) => r.buttons) ? shot : null, results }, null, 2));
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
