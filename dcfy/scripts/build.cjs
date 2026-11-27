#!/usr/bin/env node
// dcfy(구 decisionfy) 빌드: decisions.json → 단독 실행 HTML (템플릿 assets/template.html 고정).
// 사용: node build.cjs <decisions.json> [<출력.html>]
//   출력 생략 시 JSON과 같은 폴더·같은 이름의 .html.
// 하는 일: 스키마 점검(references/schema.md) → 원본 경로를 문서 허브 URL로 변환 → favicon data URI·데이터 주입.
'use strict';
const fs = require('fs');
const path = require('path');

const SKILL = path.resolve(__dirname, '..');
let env;
try { env = require(path.join(__dirname, '..', '..', 'htmlfy', 'scripts', 'lib', 'skills-env.cjs')); }
catch (e) { console.error('htmlfy 스킬이 이 스킬과 같은 폴더(예: ~/.claude/skills/htmlfy)에 있어야 한다: ' + e.message); process.exit(2); }
// 설정(환경 변수 > ~/.config/agent-skills/config.json > 기본값): 등록부 projectsJson, 허브 hubUrl(옛 DECISION_DOC_HUB), taskIdPattern.
const cfg = env.resolve({ skill: 'dcfy' });

function fail(msg) { console.error('build 실패: ' + msg); process.exit(1); }

const input = process.argv[2];
if (!input || !fs.existsSync(input)) { console.error('usage: node build.cjs <decisions.json> [out.html]'); process.exit(2); }
const out = path.resolve(process.argv[3] || input.replace(/\.json$/i, '') + '.html');

let data;
try { data = JSON.parse(fs.readFileSync(input, 'utf8')); } catch (e) { fail('JSON 파싱 오류 ' + e.message); }

// ---- 등록 프로젝트 (허브 URL 계산용) — 등록부가 없으면 현재 저장소·출력 파일 저장소 기준, 허브가 없으면 링크 자동 변환 생략 ----
const proj = env.loadProjects(cfg, [out]);
const { projects } = proj;
env.warnConfig(cfg, 'dcfy build', [env.projectsWarning(proj)]);
const hubUrl = env.makeHubUrl(cfg.values.hubUrl, projects);
const TASK_ID = env.taskIdRegex(cfg);

// ---- 스키마 점검 ----
const errs = [];
const warns = [];
const EXPLAIN = ['pros', 'cons', 'considerations'];
const RES_STATUS = ['decided', 'deferred', 'in_progress', 'done', 'blocked'];
const meta = data.meta || (errs.push('meta 없음'), {});
['title', 'date', 'taskId'].forEach((k) => { if (!meta[k]) errs.push(`meta.${k} 필요`); });
if (meta.taskId && !TASK_ID.test(meta.taskId)) errs.push(`meta.taskId 형식 아님(설정 taskIdPattern ${TASK_ID.source})`);
const decs = Array.isArray(data.decisions) ? data.decisions : (errs.push('decisions 배열 필요'), []);
const ids = new Set();
decs.forEach((d, i) => {
  const at = `decisions[${i}]${d.id ? ' ' + d.id : ''}`;
  ['id', 'project', 'title'].forEach((k) => { if (!d[k]) errs.push(`${at}: ${k} 필요`); });
  if (ids.has(d.id)) errs.push(`${at}: id 중복`);
  ids.add(d.id);
  d.type = d.type || 'single';
  if (!['single', 'multi', 'text'].includes(d.type)) errs.push(`${at}: type은 single|multi|text`);
  d.urgency = d.urgency || 'normal';
  if (!['high', 'normal', 'low'].includes(d.urgency)) errs.push(`${at}: urgency는 high|normal|low`);
  if (d.type === 'text') {
    if (!Array.isArray(d.fields) || !d.fields.length) errs.push(`${at}: text 유형은 fields 필요`);
  } else {
    if (!Array.isArray(d.options) || !d.options.length) errs.push(`${at}: options 필요`);
    const keys = new Set();
    (d.options || []).forEach((o, j) => {
      if (!o.key || !o.label) errs.push(`${at}: options[${j}] key·label 필요`);
      if (String(o.key).startsWith('__')) errs.push(`${at}: options[${j}] key는 __로 시작할 수 없음`);
      if (keys.has(o.key)) errs.push(`${at}: options key 중복 ${o.key}`);
      keys.add(o.key);
      // 장점·단점·고려할 점: 문자열 또는 문자열 배열 → 배열로 정규화(빈 값 제거)
      EXPLAIN.forEach((k) => {
        if (o[k] == null) return;
        const arr = Array.isArray(o[k]) ? o[k] : [o[k]];
        if (!arr.every((x) => typeof x === 'string')) { errs.push(`${at}: options[${j}].${k}는 문자열 또는 문자열 배열`); return; }
        const clean = arr.map((x) => x.trim()).filter(Boolean);
        if (clean.length) o[k] = clean; else delete o[k];
      });
    });
    const recN = (d.options || []).filter((o) => o.recommended).length;
    if (d.type === 'single' && recN > 1) errs.push(`${at}: single 유형 추천은 1개`);
    if (recN && !d.recommendReason) errs.push(`${at}: 추천이 있으면 recommendReason(한 줄) 필요`);
    // 경고(빌드는 계속): 선택지 2개 이상인 결정의 추천안에는 설명(pros·cons·considerations) 1개 이상
    if ((d.options || []).length >= 2) {
      (d.options || []).filter((o) => o.recommended && !EXPLAIN.some((k) => o[k])).forEach((o) => {
        warns.push(`${at}: 추천안 "${o.label}"에 pros·cons·considerations가 없음`);
      });
    }
  }
  if (!Array.isArray(d.sources) || !d.sources.length) errs.push(`${at}: sources(원본 경로·링크) 1개 이상 필요`);
  if (d.resolution != null) checkResolution(d.resolution, at);
});

// ---- resolution (2026-11-20 추가, 선택) — 사용자가 답한 항목을 읽기 전용 확정 카드로 ----
// { status, decided_at?, response_doc?, user_answer, instruction?, actions?[{date, what, who?, evidence?}], result?, remaining? }
function checkResolution(r, at) {
  at += '.resolution';
  if (!r || typeof r !== 'object' || Array.isArray(r)) { errs.push(`${at}: 객체 필요`); return; }
  if (!RES_STATUS.includes(r.status)) errs.push(`${at}.status는 ${RES_STATUS.join('|')}`);
  if (typeof r.user_answer !== 'string' || !r.user_answer.trim()) errs.push(`${at}.user_answer(사용자 응답 원문) 필요`);
  ['decided_at', 'response_doc', 'instruction', 'result'].forEach((k) => { if (r[k] != null && typeof r[k] !== 'string') errs.push(`${at}.${k}는 문자열`); });
  if (r.remaining != null) {
    const arr = Array.isArray(r.remaining) ? r.remaining : [r.remaining];
    if (!arr.every((x) => typeof x === 'string')) errs.push(`${at}.remaining은 문자열 또는 문자열 배열`);
    else { const clean = arr.map((x) => x.trim()).filter(Boolean); if (clean.length) r.remaining = clean; else delete r.remaining; }
  }
  if (r.actions != null && !Array.isArray(r.actions)) { errs.push(`${at}.actions는 배열`); return; }
  (r.actions || []).forEach((a, j) => {
    const aat = `${at}.actions[${j}]`;
    if (!a || typeof a !== 'object') { errs.push(`${aat}: 객체 필요`); return; }
    ['date', 'what'].forEach((k) => { if (typeof a[k] !== 'string' || !a[k].trim()) errs.push(`${aat}.${k} 필요`); });
    if (a.who != null && typeof a.who !== 'string') errs.push(`${aat}.who는 문자열`);
    if (a.evidence == null) return;
    const ev = Array.isArray(a.evidence) ? a.evidence : [a.evidence];
    if (!ev.every((e) => (typeof e === 'string' && e.trim()) || (e && typeof e === 'object' && (e.label || e.path || e.url)))) { errs.push(`${aat}.evidence는 문자열 또는 {label,path?,url?} 배열`); return; }
    a.evidence = ev;
  });
}
// ---- todos[] 상세 필드 (2026-11-18 추가, 모두 선택 — 문자열만 있는 기존 todo도 그대로 통과) ----
// 문자열: what, why, done, eta, report, note / 문자열 또는 배열: steps, caution, where(문자열 또는 {label,url?,path?})
const TODO_STR = ['what', 'why', 'done', 'eta', 'report', 'note'];
const TODO_LIST = ['steps', 'caution'];
if (data.todos != null && !Array.isArray(data.todos)) errs.push('todos는 배열');
(Array.isArray(data.todos) ? data.todos : []).forEach((t, i) => {
  const at = `todos[${i}]`;
  if (!t || typeof t !== 'object') { errs.push(`${at}: 객체 필요`); return; }
  ['project', 'title'].forEach((k) => { if (!t[k]) errs.push(`${at}: ${k} 필요`); });
  TODO_STR.forEach((k) => { if (t[k] != null && typeof t[k] !== 'string') errs.push(`${at}.${k}는 문자열`); });
  TODO_LIST.forEach((k) => {
    if (t[k] == null) return;
    const arr = Array.isArray(t[k]) ? t[k] : [t[k]];
    if (!arr.every((x) => typeof x === 'string')) { errs.push(`${at}.${k}는 문자열 또는 문자열 배열`); return; }
    const clean = arr.map((x) => x.trim()).filter(Boolean);
    if (clean.length) t[k] = clean; else delete t[k];
  });
  if (t.where != null) {
    const arr = Array.isArray(t.where) ? t.where : [t.where];
    if (!arr.every((x) => typeof x === 'string' || (x && typeof x === 'object' && (x.label || x.url || x.path)))) errs.push(`${at}.where는 문자열 또는 {label,url?,path?} 배열`);
    else t.where = arr.filter((x) => typeof x !== 'string' || x.trim());
  }
});
if (errs.length) fail('\n- ' + errs.join('\n- '));
if (warns.length) console.error('build 경고 ' + warns.length + '건(빌드는 계속):\n- ' + warns.join('\n- '));

// ---- 허브 URL 채우기 ----
const fill = (s) => { if (s && !s.url && s.path) { const u = hubUrl(s.path); if (u) s.url = u; } };
decs.forEach((d) => (d.sources || []).forEach(fill));
// 확정 기록 증거: http(s) → 링크, 허브가 서빙하는 절대 경로 → 허브 링크, 그 밖(커밋 SHA·작업 ID·기타 경로) → 텍스트
decs.forEach((d) => {
  const r = d.resolution; if (!r) return;
  if (r.response_doc && !r.response_doc_url) { const u = hubUrl(r.response_doc); if (u) r.response_doc_url = u; }
  (r.actions || []).forEach((a) => {
    if (!a.evidence) return;
    a.evidence = a.evidence.map((e) => {
      const o = typeof e === 'string' ? { label: e.trim() } : { ...e };
      if (!o.url && !o.path && /^https?:\/\//.test(o.label || '')) o.url = o.label;
      if (!o.url && !o.path && path.isAbsolute(o.label || '')) o.path = o.label;
      fill(o);
      return o;
    });
  });
});
(data.todos || []).forEach((t) => {
  (t.sources || []).forEach(fill);
  (t.where || []).forEach((w) => { if (w && typeof w === 'object') fill(w); });
  if (!t.url && t.path) t.url = hubUrl(t.path) || undefined;
});

// 문서 자신의 경로·허브 URL
if (!meta.docPath) meta.docPath = out;
const selfUrl = hubUrl(out);

// ---- 주입 ----
const tpl = fs.readFileSync(path.join(SKILL, 'assets/template.html'), 'utf8');
const svg = fs.readFileSync(path.join(SKILL, 'assets/favicon.svg'), 'utf8').trim();
const favicon = 'data:image/svg+xml,' + encodeURIComponent(svg);
const json = JSON.stringify(data).replace(/</g, '\\u003c');
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const html = tpl
  .replace('__TITLE__', () => esc(meta.title))
  .replace('__FAVICON__', () => favicon)
  .replace('__DATA__', () => json);

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(JSON.stringify({
  ok: true, out, hubUrl: selfUrl,
  decisions: decs.length, urgent: decs.filter((d) => d.urgency === 'high').length,
  byProject: decs.reduce((m, d) => ((m[d.project] = (m[d.project] || 0) + 1), m), {}),
  todos: (data.todos || []).length,
  explainedOptions: decs.reduce((n, d) => n + (d.options || []).filter((o) => EXPLAIN.some((k) => o[k])).length, 0),
  warnings: warns.length,
  resolved: decs.filter((d) => d.resolution).length,
  resolvedByStatus: decs.filter((d) => d.resolution).reduce((m, d) => ((m[d.resolution.status] = (m[d.resolution.status] || 0) + 1), m), {}),
}, null, 2));
