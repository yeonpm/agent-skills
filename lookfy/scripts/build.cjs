#!/usr/bin/env node
// lookfy 빌드: mockups.json → 단독 실행 시안 문서 HTML (골격 assets/template.html, 부품 focus-points·mockup-picker 인라인).
// 사용: node build.cjs <mockups.json> [<출력.html>]   출력 생략 시 JSON과 같은 폴더·같은 이름의 .html
// 하는 일: 스키마 점검(references/schema.md) → 시안 수 = meta.count(N) 검사(다르면 실패) → 번호 규칙(01..N / 이어 번호 / R2-) 검사
//          → 방향·이름·콘셉트 중복 검사(중복이면 실패: 합치지 말고 다른 방향으로 교체) → HTML 생성 → 결과 카드 수 재검사.
'use strict';
const fs = require('fs');
const path = require('path');

const SKILL = path.resolve(__dirname, '..');
const FAVICON = path.join(SKILL, '..', 'htmlfy', 'assets', 'favicon.svg');
let env;
try { env = require(path.join(__dirname, '..', '..', 'htmlfy', 'scripts', 'lib', 'skills-env.cjs')); }
catch (e) { console.error('htmlfy 스킬이 이 스킬과 같은 폴더(예: ~/.claude/skills/htmlfy)에 있어야 한다: ' + e.message); process.exit(2); }
// 설정(환경 변수 > ~/.config/agent-skills/config.json > 기본값): 등록부 projectsJson, 허브 hubUrl(옛 LOOKFY_HUB), taskIdPattern.
const cfg = env.resolve({ skill: 'lookfy' });

function fail(msg) { console.error('build 실패: ' + msg); process.exit(1); }
const input = process.argv[2];
if (!input || !fs.existsSync(input)) { console.error('usage: node build.cjs <mockups.json> [out.html]'); process.exit(2); }
const out = path.resolve(process.argv[3] || input.replace(/\.json$/i, '') + '.html');
let data;
try { data = JSON.parse(fs.readFileSync(input, 'utf8')); } catch (e) { fail('JSON 파싱 오류 ' + e.message); }

// ---- 허브 URL (등록 프로젝트의 docs/·knowledge/ 아래만 서빙). 허브·등록부가 없으면 빈 값 ----
const proj = env.loadProjects(cfg, [out]);
const { projects } = proj;
env.warnConfig(cfg, 'lookfy build', [env.projectsWarning(proj)]);
const toHub = env.makeHubUrl(cfg.values.hubUrl, projects);
const hubUrl = (abs) => toHub(abs) || '';
const TASK_ID = env.taskIdRegex(cfg);

// ---- 스키마 점검 ----
const errs = [], warns = [];
const meta = data.meta || (errs.push('meta 없음'), {});
['title', 'date', 'taskId', 'count'].forEach((k) => { if (meta[k] == null || meta[k] === '') errs.push(`meta.${k} 필요`); });
if (meta.taskId && !TASK_ID.test(meta.taskId)) errs.push(`meta.taskId 형식 아님(설정 taskIdPattern ${TASK_ID.source})`);
const N = Number(meta.count);
if (!Number.isInteger(N) || N < 1) errs.push('meta.count는 1 이상 정수(사용자가 준 개수, 기본 30)');
const round = Number(meta.round || 1);
const V = Array.isArray(data.variants) ? data.variants : (errs.push('variants 배열 필요'), []);
if (Number.isInteger(N) && V.length !== N) errs.push(`시안 수 불일치: 요청 ${N}개 ≠ variants ${V.length}개 (정확히 N개여야 함)`);

// 번호 규칙: 라운드 1 → 01..N, 라운드 2+ → numbering "continue"(meta.startNo부터 이어 번호) 또는 "prefix"(R<라운드>-01..)
const width = Math.max(2, String((round > 1 && meta.numbering === 'continue' ? Number(meta.startNo || 1) : 1) + N - 1).length);
const pad = (n) => String(n).padStart(width, '0');
let expected;
if (round === 1) expected = V.map((_, i) => pad(i + 1));
else if (meta.numbering === 'continue') {
  if (!Number.isInteger(Number(meta.startNo)) || Number(meta.startNo) < 2) errs.push('라운드 2+ continue: meta.startNo(이전 라운드 마지막 번호+1) 필요');
  expected = V.map((_, i) => pad(Number(meta.startNo || 1) + i));
} else if (meta.numbering === 'prefix') expected = V.map((_, i) => `R${round}-${String(i + 1).padStart(2, '0')}`);
else { errs.push('라운드 2+: meta.numbering은 "continue" 또는 "prefix"'); expected = []; }
V.forEach((v, i) => { if (expected[i] && v.id !== expected[i]) errs.push(`variants[${i}].id "${v.id}" ≠ 기대 번호 "${expected[i]}" (번호는 고정·연속)`); });

const norm = (t) => String(t || '').toLowerCase().replace(/[\s·,.\-—_()\/]+/g, '');
const seen = { name: new Map(), direction: new Map(), concept: new Map() };
const criteria = Array.isArray(data.criteria) ? data.criteria : [];
if (criteria.length < 2) warns.push('criteria(비교표 열) 2개 이상 권장');
const len = (a) => (Array.isArray(a) ? a.length : 0);
V.forEach((v, i) => {
  const at = `variants[${i}] ${v.id || ''}`;
  ['name', 'concept', 'direction', 'mock'].forEach((k) => { if (!v[k]) errs.push(`${at}: ${k} 필요`); });
  for (const k of ['name', 'direction', 'concept']) {
    const key = norm(v[k]);
    if (key && seen[k].has(key)) errs.push(`${at}: ${k} 중복(${seen[k].get(key)}와 같음) — 비슷한 시안은 합치지 말고 다른 방향으로 교체`);
    else if (key) seen[k].set(key, v.id);
  }
  if (len(v.features) < 2 || len(v.features) > 4) errs.push(`${at}: features 2~4개`);
  if (len(v.pros) < 1) errs.push(`${at}: pros 1개 이상`);
  if (len(v.cons) < 1) errs.push(`${at}: cons(고려할 점) 1개 이상`);
  if (len(v.points) < 2 || len(v.points) > 4) errs.push(`${at}: points(봐야 할 포인트) 2~4개`);
  (v.points || []).forEach((p, j) => {
    if (!p.text) errs.push(`${at}: points[${j}].text 필요`);
    if (p.area) ['x', 'y', 'w', 'h'].forEach((k) => { if (typeof p.area[k] !== 'number') errs.push(`${at}: points[${j}].area.${k} 숫자(%) 필요`); });
  });
  criteria.forEach((c) => { if (!v.scores || v.scores[c] == null) warns.push(`${at}: scores["${c}"] 없음(— 표시)`); });
  const m = v.mock || {};
  if (v.mock && !m.svg && !m.html && !m.img) errs.push(`${at}: mock은 svg|html|img 중 하나`);
});
const rec = (data.summary && data.summary.recommend) || [];
if (rec.length < 1 || rec.length > 2) errs.push('summary.recommend 1~2개');
rec.forEach((r) => { if (!V.some((v) => v.id === r.id)) errs.push(`summary.recommend id ${r.id} 없음`); if (!r.reason) errs.push(`summary.recommend ${r.id}: reason 한 줄 필요`); });
if (round > 1) {
  if (!len(data.feedback)) errs.push('라운드 2+: feedback(사용자 원문 피드백 반영표) 필요');
  if (!len(data.mix)) errs.push('라운드 2+: mix(조합 분석) 필요');
}
if (errs.length) { console.error('build 실패:\n- ' + errs.join('\n- ')); process.exit(1); }

// ---- HTML 생성 ----
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const recIds = rec.map((r) => r.id);
const byId = Object.fromEntries(V.map((v) => [v.id, v]));
const hasFocus = V.some((v) => (v.points || []).some((p) => p.area)) || (data.current && (data.current.problems || []).some((p) => p.area));
const many = N >= 10;
const docUrl = hubUrl(out);
const docPath = meta.docPath || out;

function stage(mock, focusPrefix, points, label) {
  let inner;
  if (mock.svg) inner = mock.svg;
  else if (mock.img) inner = `<img src="${esc(mock.img)}" alt="${esc(mock.alt || label)}"${mock.width ? ` width="${mock.width}" height="${mock.height}"` : ''} loading="lazy">`;
  else inner = mock.html;
  const areas = (points || []).map((p, j) => p.area
    ? `<span class="fp-area" data-focus="${focusPrefix}-${j + 1}" data-no="${j + 1}" style="--x:${p.area.x}%;--y:${p.area.y}%;--w:${p.area.w}%;--h:${p.area.h}%${p.area.r != null ? `;--r:${esc(p.area.r)}` : ''}"></span>` : '').join('');
  return `<div class="fp-stage">${inner}${areas}</div>`;
}
function pointList(prefix, points) {
  if ((points || []).some((p) => p.area)) {
    return `<ul class="fp-list">${points.map((p, j) => p.area
      ? `<li><button type="button" class="fp-btn" data-target="${prefix}-${j + 1}"><span class="fp-no">${j + 1}</span><span>${esc(p.text)}</span></button></li>`
      : `<li class="fp-btn" style="cursor:default"><span class="fp-no">${j + 1}</span><span>${esc(p.text)}</span></li>`).join('')}</ul>`;
  }
  return `<ol class="pts">${points.map((p) => `<li>${esc(p.text)}</li>`).join('')}</ol>`;
}
const ul = (a) => `<ul>${(a || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
const fid = (id) => 'v' + String(id).replace(/[^\w-]/g, '');

const b = [];
const idRange = `${V[0].id}~${V[V.length - 1].id}`;
b.push(`<h1>${esc(meta.title)}</h1>`);
b.push(`<p class="sub">${esc([meta.subtitle, meta.date, meta.taskId, meta.project && '프로젝트 ' + meta.project, round > 1 ? `라운드 ${round}` : '라운드 1'].filter(Boolean).join(' · '))}</p>`);
const sum = data.summary || {};
b.push(`<section class="sum" id="summary"><b>핵심 요약</b><ul>
<li><b>시안</b>: ${N}개(${esc(idRange)})${data.current ? ' + 현재안' : ''}.${sum.note ? ' ' + esc(sum.note) : ''}</li>
<li><b>추천</b>: ${rec.map((r, i) => `<b>${i + 1}순위 <a href="#${fid(r.id)}">${esc(r.id)} ${esc(byId[r.id].name)}</a></b> — ${esc(r.reason)}`).join(' ')}</li>
<li><b>사용자 할 일</b>: ${esc(sum.todo || '마음에 드는 시안 카드의 [이 시안 선택] 버튼을 누르고, 필요하면 카드별·전체 의견을 적어 주세요.')} 고르거나 적을 때마다 화면 아래 프롬프트가 자동으로 복사되니 대화창에 붙여 넣으면 됩니다.${meta.multi ? ' 여러 개를 골라도 됩니다.' : ' 하나만 고를 수 있고, 다시 누르면 해제됩니다.'}${hasFocus ? ' 포인트 버튼이 있는 카드는 누르면 해당 영역이 강조되고, 다시 누르거나 Esc로 해제합니다.' : ''}</li>
${(sum.extra || []).map((x) => `<li>${esc(x)}</li>`).join('')}
</ul></section>`);
b.push(`<nav class="toc"><a href="#table">비교표</a>${data.current ? '<a href="#now">현재안</a>' : ''}<a href="#cards">시안 ${N}개</a>${round > 1 ? '<a href="#feedback">피드백 반영</a><a href="#mix">조합 분석</a>' : ''}<a href="#opinion">전체 의견</a></nav>`);
b.push(`<p class="legend">범례: <span class="badge u">[사용자 확인]</span> 사용자 원문 근거 · <span class="badge p">[제안]</span> 이 문서 제안 · <span class="badge rec">추천</span> 추천 시안</p>`);

let sec = 1;
const row = (no, name, href, dir, scores, recTxt) => `<tr><td>${esc(no)}</td><td><a href="#${href}">${esc(name)}</a></td><td>${esc(dir || '')}</td>${criteria.map((c) => `<td>${esc(scores && scores[c] != null ? scores[c] : '—')}</td>`).join('')}<td>${recTxt}</td></tr>`;
b.push(`<h2 id="table">${sec++}. 같은 기준 비교</h2><div class="tw"><table>
<tr><th>#</th><th>이름</th><th>방향</th>${criteria.map((c) => `<th>${esc(c)}</th>`).join('')}<th>추천</th></tr>
${data.current ? row('현재', data.current.name, 'now', data.current.direction || '현재 화면', data.current.scores, '') : ''}
${V.map((v) => row(v.id, v.name, fid(v.id), v.direction, v.scores, recIds.includes(v.id) ? `<span class="badge rec">${recIds.indexOf(v.id) + 1}순위</span>` : '')).join('\n')}
</table></div>`);

if (data.current) {
  const c = data.current;
  b.push(`<h2 id="now">${sec++}. 현재안</h2><div class="grid"><article class="card" id="now-card">
${stage(c.mock || { html: '' }, 'now', c.problems, '현재안')}
<div><div class="ch"><span class="no">현재</span><h3>${esc(c.name)}</h3></div>
<p class="concept">${esc(c.concept || '')}</p>
<p class="label">문제${c.problemsLabel ? '(' + esc(c.problemsLabel) + ')' : ''}</p>
${pointList('now', c.problems || [])}</div></article></div>`);
}

b.push(`<h2 id="cards">${sec++}. 시안 ${N}개</h2><div class="grid${many ? ' many' : ''}">`);
V.forEach((v) => {
  const ri = recIds.indexOf(v.id);
  b.push(`<article class="card mp-card" id="${fid(v.id)}" data-mp-id="${esc(v.id)}" data-mp-name="${esc(v.name)}">
${stage(v.mock, fid(v.id), v.points, `시안 ${v.id} ${v.name}`)}
<div><div class="ch"><span class="no">${esc(v.id)}</span><h3>${esc(v.name)}</h3>${ri >= 0 ? `<span class="badge rec">추천 ${ri + 1}</span>` : ''}${v.proposal ? '<span class="badge p">[제안]</span>' : ''}</div>
<p class="concept">${esc(v.concept)}</p>
<p><span class="badge dir">방향: ${esc(v.direction)}</span></p>
<ul class="feat">${v.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
<div class="pc"><div><b>장점</b>${ul(v.pros)}</div><div><b>고려할 점</b>${ul(v.cons)}</div></div>
<p class="label">봐야 할 포인트</p>
${pointList(fid(v.id), v.points)}
<div class="mp-slot"></div></div></article>`);
});
b.push('</div>');

if (round > 1) {
  b.push(`<h2 id="feedback">${sec++}. 사용자 피드백 반영표</h2><div class="tw"><table><tr><th>원문 <span class="badge u">[사용자 확인]</span></th><th>출처·날짜</th><th>반영 위치·방식</th></tr>
${data.feedback.map((f) => `<tr><td>“${esc(f.quote)}”</td><td>${esc(f.source || '')}</td><td>${esc(f.applied || '')}</td></tr>`).join('')}</table></div>`);
  b.push(`<h2 id="mix">${sec++}. 조합 분석</h2><div class="tw"><table><tr><th>요소</th><th>해결하는 문제</th><th>부딪히는 점</th><th>어떻게 조합했는지 <span class="badge p">[제안]</span></th></tr>
${data.mix.map((m) => `<tr><td>${esc(m.element)}</td><td>${esc(m.solves)}</td><td>${esc(m.conflicts)}</td><td>${esc(m.how)}</td></tr>`).join('')}</table></div>`);
}
b.push(`<h2 id="opinion">${sec++}. 전체 의견</h2><div class="mp-overall" style="margin-top:0"></div>`);
b.push(`<footer>작성 ${esc(meta.date)} · 작업 ID ${esc(meta.taskId)} · 원본 <code>${esc(docPath)}</code>${docUrl ? ` · 허브 <code>${esc(docUrl)}</code>` : ''} · lookfy로 생성(시안 ${N}개)</footer>`);

const metas = [
  ['mp-title', meta.title], ['mp-date', meta.date], ['mp-task', meta.taskId], ['mp-path', docPath], ['mp-url', docUrl], ['mp-multi', meta.multi ? '1' : ''], ['lookfy-count', String(N)],
].filter(([, v]) => v).map(([k, v]) => `<meta name="${k}" content="${esc(v)}">`).join('\n');
const read = (f) => fs.readFileSync(path.join(SKILL, 'assets', f), 'utf8');
let favicon = '';
try { favicon = 'data:image/svg+xml,' + encodeURIComponent(fs.readFileSync(FAVICON, 'utf8').trim()); } catch { warns.push('favicon 없음: ' + FAVICON); }
const fill = { __TITLE__: esc(meta.title), __FAVICON__: favicon, __METAS__: metas, __FP_CSS__: read('focus-points.css'), __MP_CSS__: read('mockup-picker.css'), __BODY__: b.join('\n'), __FP_JS__: read('focus-points.js'), __MP_JS__: read('mockup-picker.js') };
let html = read('template.html');
for (const [k, v] of Object.entries(fill)) html = html.split(k).join(v);

// ---- 결과 카드 수 재검사 ----
const ids = [...html.matchAll(/class="card mp-card"[^>]*data-mp-id="([^"]+)"/g)].map((m) => m[1]);
if (ids.length !== N || new Set(ids).size !== N) fail(`생성 결과 시안 카드 ${ids.length}개(고유 ${new Set(ids).size}) ≠ 요청 ${N}개`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(JSON.stringify({ ok: true, out, hubUrl: docUrl || null, count: N, cards: ids.length, ids: `${ids[0]}~${ids[ids.length - 1]}`, focusButtons: hasFocus, warnings: warns }, null, 2));
