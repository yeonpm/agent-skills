// agent-skills 공용 환경 해석 모듈 (htmlfy·dcfy·lookfy 스크립트가 함께 쓴다).
// 우선순위: 환경 변수 > 설정 파일 > 기본값. 기본값은 개인 환경 없이 동작하도록 정한다.
//   설정 파일: $AGENT_SKILLS_CONFIG 또는 ${XDG_CONFIG_HOME:-~/.config}/agent-skills/config.json (없어도 된다)
//   값의 앞 ~ 는 홈 폴더로 바꾼다. 환경 변수를 빈 문자열로 주면 "없음"으로 덮어쓴다.
// 키 목록·설명은 README의 "설정" 절과 KEYS 아래 정의가 같아야 한다.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawnSync, spawn } = require('child_process');

const home = () => os.homedir();
const expand = (p) => (typeof p === 'string' && (p === '~' || p.startsWith('~/')) ? path.join(home(), p.slice(1)) : p);

// key: { env: [먼저 보는 환경 변수…], type, desc }
const KEYS = {
  projectsJson: { env: ['AGENT_SKILLS_PROJECTS_JSON', 'AGENCY_PROJECTS_JSON'], type: 'path', desc: '프로젝트 등록부 JSON({projects:[{id,path}]} 또는 배열). 없으면 현재 git 저장소 하나만 등록된 것으로 본다' },
  agencyDir: { env: ['AGENT_SKILLS_AGENCY_DIR'], type: 'path', desc: '에이전트 운영 저장소(templates/agent-handoff.md 등). 없으면 projectsJson이 <dir>/config/projects.json일 때 <dir>' },
  hubUrl: { env: ['AGENT_SKILLS_HUB_URL'], type: 'url', desc: '로컬 문서 허브 주소(/f/<project-id>/<경로> 형식). 없으면 허브 링크를 만들지 않고 file:// 또는 임시 로컬 서버로 연다' },
  hubStartCommand: { env: ['AGENT_SKILLS_HUB_START_COMMAND'], type: 'string', desc: '허브가 꺼져 있을 때 안내할 시작 명령(선택)' },
  openCommand: { env: ['AGENT_SKILLS_OPEN_COMMAND'], type: 'string', desc: '사용자에게 문서를 띄우는 명령(뒤에 URL이 붙는다). 기본: macOS open, Linux xdg-open, Windows start' },
  playwrightModule: { env: ['AGENT_SKILLS_PLAYWRIGHT_MODULE'], type: 'path', desc: 'playwright-core(또는 playwright) 패키지 폴더. 없으면 표준 위치를 차례로 찾는다' },
  browserExecutable: { env: ['AGENT_SKILLS_BROWSER_EXECUTABLE'], type: 'path', desc: '검증용 Chromium 계열 실행 파일. 없으면 Playwright 캐시 → 설치된 Chrome/Chromium/Edge 순으로 찾는다' },
  taskIdPattern: { env: ['AGENT_SKILLS_TASK_ID_PATTERN'], type: 'string', desc: '문서 meta.taskId 정규식. 기본은 영문·숫자·._- 로 된 아무 ID' },
  decisionsDir: { env: ['AGENT_SKILLS_DECISIONS_DIR'], type: 'path', desc: 'dcfy 여러 프로젝트 결정 문서 저장 폴더. 기본 <agencyDir>/docs/reports/decisions, 없으면 <현재 저장소>/docs/reports/decisions' },
  excludePaths: { env: ['AGENT_SKILLS_EXCLUDE_PATHS'], type: 'list', desc: '수집·참조에서 뺄 경로 목록(환경 변수는 경로 구분자 : 로 나눔)' },
  nodeSetup: { env: ['AGENT_SKILLS_NODE_SETUP'], type: 'string', desc: '스크립트 전에 실행할 셸 준비 명령(예: nvm use). 기본 없음' },
};
// 스킬별 옛 환경 변수(호환): 공용 변수보다 먼저 본다.
const LEGACY = { dcfy: { hubUrl: ['DECISION_DOC_HUB'] }, lookfy: { hubUrl: ['LOOKFY_HUB'] } };
const DEFAULT_TASK_ID = '^[A-Za-z0-9][A-Za-z0-9._-]*$';

function configPath() {
  if (process.env.AGENT_SKILLS_CONFIG) return expand(process.env.AGENT_SKILLS_CONFIG);
  const base = process.env.XDG_CONFIG_HOME ? expand(process.env.XDG_CONFIG_HOME) : path.join(home(), '.config');
  return path.join(base, 'agent-skills', 'config.json');
}

function readConfigFile() {
  const file = configPath();
  if (!fs.existsSync(file)) return { file, exists: false, data: {} };
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('최상위는 객체여야 한다');
    const unknown = Object.keys(data).filter((k) => !KEYS[k] && !k.startsWith('$') && !k.startsWith('_'));
    return { file, exists: true, data, unknown };
  } catch (e) {
    return { file, exists: true, data: {}, error: e.message };
  }
}

function gitRoot(dir) {
  try {
    const r = spawnSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
    return r.status === 0 ? r.stdout.trim() : null;
  } catch { return null; }
}

function normalize(key, value) {
  if (value == null || value === '') return null;
  const t = KEYS[key].type;
  if (t === 'list') return (Array.isArray(value) ? value : String(value).split(path.delimiter)).map(String).filter(Boolean).map(expand);
  if (t === 'path') return expand(String(value));
  if (t === 'url') return String(value).replace(/\/+$/, '');
  return String(value);
}

// 해석 결과: { values, sources, file } — sources[key] = 'env:NAME' | 'config' | 'default' | 'derived'
function resolve(opts = {}) {
  const skill = opts.skill || null;
  const cfg = readConfigFile();
  const values = {};
  const sources = {};
  for (const key of Object.keys(KEYS)) {
    const envNames = [...((LEGACY[skill] || {})[key] || []), ...KEYS[key].env];
    const hit = envNames.find((n) => process.env[n] != null);
    if (hit) { values[key] = normalize(key, process.env[hit]); sources[key] = 'env:' + hit; continue; }
    if (Object.prototype.hasOwnProperty.call(cfg.data, key)) { values[key] = normalize(key, cfg.data[key]); sources[key] = 'config'; continue; }
    values[key] = null; sources[key] = 'default';
  }
  // 파생 기본값
  if (!values.agencyDir && sources.agencyDir === 'default' && values.projectsJson && /config[\\/]projects\.json$/.test(values.projectsJson)) {
    values.agencyDir = path.dirname(path.dirname(values.projectsJson)); sources.agencyDir = 'derived';
  }
  if (!values.taskIdPattern && sources.taskIdPattern === 'default') values.taskIdPattern = DEFAULT_TASK_ID;
  if (!values.openCommand && sources.openCommand === 'default') values.openCommand = defaultOpenCommand();
  if (!values.excludePaths) values.excludePaths = [];
  if (!values.decisionsDir && sources.decisionsDir === 'default') {
    const base = values.agencyDir || gitRoot(process.cwd()) || process.cwd();
    values.decisionsDir = path.join(base, 'docs', 'reports', 'decisions'); sources.decisionsDir = 'derived';
  }
  return { values, sources, file: cfg.file, fileExists: cfg.exists, fileError: cfg.error || null, unknownKeys: cfg.unknown || [] };
}

function defaultOpenCommand() {
  if (process.platform === 'darwin') return 'open';
  if (process.platform === 'win32') return 'cmd /c start ""';
  return 'xdg-open';
}

// ---- 프로젝트 등록부 ----
// projectsJson이 있으면 그 목록, 없거나 읽지 못하면 현재 git 저장소(및 추가로 준 경로의 저장소) 하나씩.
function loadProjects(cfg, extraPaths = []) {
  const file = cfg.values.projectsJson;
  if (file) {
    try {
      const pj = JSON.parse(fs.readFileSync(file, 'utf8'));
      const list = (Array.isArray(pj) ? pj : pj.projects || []).filter((p) => p && p.id && p.path).map((p) => ({ id: p.id, path: expand(p.path) }));
      return { source: 'projectsJson', file, projects: list };
    } catch (e) {
      return { source: 'cwd', file, error: e.message, projects: fallbackProjects(extraPaths) };
    }
  }
  return { source: 'cwd', file: null, projects: fallbackProjects(extraPaths) };
}
function fallbackProjects(extraPaths) {
  const roots = [process.cwd(), ...extraPaths.map((p) => path.dirname(path.resolve(p)))].map(gitRoot).filter(Boolean);
  return [...new Set(roots)].map((r) => ({ id: path.basename(r), path: r }));
}

// 허브는 등록 프로젝트의 docs/·knowledge/ 아래와 루트 STATUS.md·README.md만 서빙한다. 허브가 없으면 null.
function makeHubUrl(hub, projects) {
  return function hubUrl(abs) {
    if (!hub || !abs || !path.isAbsolute(abs)) return null;
    const p = projects
      .filter((x) => abs === x.path || abs.startsWith(x.path.replace(/\/$/, '') + '/'))
      .sort((a, b) => b.path.length - a.path.length)[0];
    if (!p) return null;
    const [rel, hash] = path.relative(p.path, abs).split('#');
    if (!/^(docs|knowledge)\//.test(rel) && !['STATUS.md', 'README.md'].includes(rel)) return null;
    return `${hub}/f/${p.id}/${rel.split('/').map(encodeURIComponent).join('/')}${hash ? '#' + hash : ''}`;
  };
}

// ---- 허브 상태 ----
function probe(url, timeoutMs = 1500) {
  return new Promise((done) => {
    if (!url) return done({ ok: false, reason: 'not-configured' });
    let lib;
    try { lib = new URL(url).protocol === 'https:' ? https : http; } catch { return done({ ok: false, reason: 'invalid-url' }); }
    const req = lib.get(url, { timeout: timeoutMs }, (res) => { res.resume(); done({ ok: res.statusCode < 500, status: res.statusCode }); });
    req.on('timeout', () => { req.destroy(); done({ ok: false, reason: 'timeout' }); });
    req.on('error', (e) => done({ ok: false, reason: e.code || e.message }));
  });
}

// ---- Playwright ----
function playwrightCandidates(cfg) {
  const list = [];
  if (cfg.values.playwrightModule) list.push({ from: cfg.sources.playwrightModule, dir: cfg.values.playwrightModule });
  for (const base of [path.join(home(), '.cache', 'agent-skills'), path.join(home(), '.cache', 'htmlfy-verify')]) {
    list.push({ from: 'default', dir: path.join(base, 'node_modules', 'playwright-core') });
  }
  for (const name of ['playwright-core', 'playwright']) list.push({ from: 'require', name });
  const globalRoot = process.platform === 'win32' ? path.join(path.dirname(process.execPath), 'node_modules') : path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules');
  for (const name of ['playwright-core', 'playwright']) list.push({ from: 'global', dir: path.join(globalRoot, name) });
  return list;
}
function loadPlaywright(cfg) {
  const tried = [];
  for (const c of playwrightCandidates(cfg)) {
    try {
      const target = c.dir || require.resolve(c.name, { paths: [process.cwd(), __dirname] });
      if (c.dir && !fs.existsSync(c.dir)) { tried.push(c.dir); continue; }
      const mod = require(target);
      if (mod && mod.chromium) {
        let version = null;
        try { const pkgDir = c.dir || path.dirname(require.resolve(c.name + '/package.json', { paths: [process.cwd(), __dirname] })); version = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')).version; } catch {}
        return { chromium: mod.chromium, from: c.from, location: c.dir || target, version };
      }
    } catch { tried.push(c.dir || c.name); }
  }
  return { chromium: null, tried };
}
const PLAYWRIGHT_HINT = 'playwright-core 없음. 설치(1회, 네트워크 필요): mkdir -p ~/.cache/agent-skills && cd ~/.cache/agent-skills && npm i playwright-core  (다른 위치면 설정 playwrightModule 또는 AGENT_SKILLS_PLAYWRIGHT_MODULE)';

function playwrightCacheDirs() {
  const dirs = [];
  if (process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.PLAYWRIGHT_BROWSERS_PATH !== '0') dirs.push(process.env.PLAYWRIGHT_BROWSERS_PATH);
  if (process.platform === 'darwin') dirs.push(path.join(home(), 'Library', 'Caches', 'ms-playwright'));
  else if (process.platform === 'win32') dirs.push(path.join(process.env.LOCALAPPDATA || path.join(home(), 'AppData', 'Local'), 'ms-playwright'));
  else dirs.push(path.join(process.env.XDG_CACHE_HOME || path.join(home(), '.cache'), 'ms-playwright'));
  return dirs;
}
const CACHE_BINARIES = [
  ['chrome-mac-arm64', 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'],
  ['chrome-mac', 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'],
  ['chrome-mac', 'Chromium.app/Contents/MacOS/Chromium'],
  ['chrome-linux64', 'chrome'], ['chrome-linux', 'chrome'],
  ['chrome-win64', 'chrome.exe'], ['chrome-win', 'chrome.exe'],
];
function systemBrowsers() {
  if (process.platform === 'darwin') {
    return ['Google Chrome', 'Chromium', 'Microsoft Edge', 'Brave Browser'].flatMap((n) => [`/Applications/${n}.app/Contents/MacOS/${n}`, path.join(home(), `Applications/${n}.app/Contents/MacOS/${n}`)]);
  }
  if (process.platform === 'win32') {
    const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
    return roots.flatMap((r) => [path.join(r, 'Google/Chrome/Application/chrome.exe'), path.join(r, 'Microsoft/Edge/Application/msedge.exe')]);
  }
  const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'];
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  return names.flatMap((n) => dirs.map((d) => path.join(d, n)));
}
// 반환: { path, from } 또는 { path: undefined }(Playwright 기본 동작에 맡김)
function findBrowser(cfg, chromium) {
  if (cfg.values.browserExecutable) return { path: cfg.values.browserExecutable, from: cfg.sources.browserExecutable };
  try { const def = chromium && chromium.executablePath(); if (def && fs.existsSync(def)) return { path: def, from: 'playwright-default' }; } catch {}
  for (const cache of playwrightCacheDirs()) {
    if (!fs.existsSync(cache)) continue;
    const dirs = fs.readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => b.split('-')[1] - a.split('-')[1]);
    for (const d of dirs) for (const [sub, bin] of CACHE_BINARIES) {
      const p = path.join(cache, d, sub, bin);
      if (fs.existsSync(p)) return { path: p, from: 'playwright-cache' };
    }
  }
  const sys = systemBrowsers().find((p) => fs.existsSync(p));
  if (sys) return { path: sys, from: 'system' };
  return { path: undefined, from: 'none' };
}

// 스크립트용: playwright를 읽고 브라우저를 띄운다. 실패하면 안내 후 exit 2.
async function launchBrowser(opts = {}) {
  const cfg = resolve(opts);
  if (!opts.quiet) warnConfig(cfg, opts.skill);
  const pw = loadPlaywright(cfg);
  if (!pw.chromium) { console.error(PLAYWRIGHT_HINT); process.exit(2); }
  const exe = findBrowser(cfg, pw.chromium);
  try {
    return await pw.chromium.launch({ executablePath: exe.path });
  } catch (e) {
    console.error('브라우저 실행 실패(' + (exe.path || 'Playwright 기본') + '): ' + String(e.message || e).split('\n')[0]);
    console.error('Chrome/Chromium을 설치하거나 설정 browserExecutable(AGENT_SKILLS_BROWSER_EXECUTABLE)로 실행 파일을 지정한다. 진단: node <htmlfy>/scripts/doctor.cjs');
    process.exit(2);
  }
}

// ---- 임시 로컬 서버: 파일이 있는 폴더를 127.0.0.1 빈 포트로 서빙(보안 컨텍스트) ----
const TYPES = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8' };
// 안전 장치: 폴더 밖 경로(.., 인코딩된 %2f 포함) 404, 잘못된 퍼센트 인코딩 400, Host가 127.0.0.1·localhost·[::1]이 아니면 403
// (DNS 리바인딩 방지), 요청 처리 중 예외는 500으로 응답하고 서버는 계속 뜬다.
const LOCAL_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;
function serveFile(file, port = 0) {
  const root = fs.realpathSync(path.dirname(path.resolve(file)));
  const send = (res, code) => { if (!res.headersSent) res.writeHead(code); res.end(); };
  const handle = (req, res) => {
    if (!LOCAL_HOST.test(req.headers.host || '')) return send(res, 403);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405);
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); } catch { return send(res, 400); }
    if (rel.includes('\0')) return send(res, 400);
    const p = path.join(root, rel);
    if (p !== root && !p.startsWith(root + path.sep)) return send(res, 404);
    let real;
    try { real = fs.realpathSync(p); } catch { return send(res, 404); }
    if (!real.startsWith(root + path.sep) || fs.statSync(real).isDirectory()) return send(res, 404);
    res.writeHead(200, { 'content-type': TYPES[path.extname(real).toLowerCase()] || 'application/octet-stream' });
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(real);
    stream.on('error', () => send(res, 500));
    stream.pipe(res);
  };
  const server = http.createServer((req, res) => {
    try { handle(req, res); } catch { send(res, 500); }
  });
  server.on('clientError', (e, socket) => { try { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); } catch {} });
  return new Promise((ok, fail) => {
    server.on('error', fail);
    server.listen(port, '127.0.0.1', () => ok({ server, url: `http://127.0.0.1:${server.address().port}/${encodeURIComponent(path.basename(file))}` }));
  });
}

// ---- 문서 띄우기: 명령 문자열 + URL ----
function splitCommand(cmd) {
  const out = []; let cur = ''; let q = null; let has = false;
  for (const ch of cmd) {
    if (q) { if (ch === q) q = null; else cur += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; has = true; continue; }
    if (/\s/.test(ch)) { if (cur || has) out.push(cur); cur = ''; has = false; continue; }
    cur += ch;
  }
  if (cur || has) out.push(cur);
  return out;
}
// Windows cmd(start)는 & | < > ^ " 를 명령 구분자로 해석한다. file:// URL은 퍼센트 인코딩, 그 밖 URL은 ^로 이스케이프한다.
function cmdSafeUrl(url) {
  if (/^file:/i.test(url)) return url.replace(/[&|<>^"]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
  return url.replace(/[&|<>^"]/g, (c) => (c === '"' ? '%22' : '^' + c));
}
function openArgs(cfg, url) {
  const [bin, ...args] = splitCommand(cfg.values.openCommand);
  const viaCmd = /^cmd(\.exe)?$/i.test(path.basename(bin || ''));
  return [bin, ...args, viaCmd ? cmdSafeUrl(url) : url];
}
function openUrl(cfg, url) {
  const [bin, ...rest] = openArgs(cfg, url);
  const child = spawn(bin, rest, { stdio: 'ignore', detached: true });
  child.on('error', (e) => console.error('열기 실패(' + cfg.values.openCommand + '): ' + e.message));
  child.unref();
  return [bin, ...rest];
}

function taskIdRegex(cfg) {
  try { return new RegExp(cfg.values.taskIdPattern); } catch { return new RegExp(DEFAULT_TASK_ID); }
}

// 설정 문제 목록(조용히 기본값으로 넘어가지 않도록 스크립트가 stderr로 알린다).
function configWarnings(cfg) {
  const w = [];
  if (cfg.fileError) w.push(`설정 파일 읽기 실패(${cfg.file}): ${cfg.fileError} → 설정 파일 무시, 환경 변수·기본값 사용`);
  if (cfg.unknownKeys && cfg.unknownKeys.length) w.push(`설정 파일의 알 수 없는 키: ${cfg.unknownKeys.join(', ')} (키 목록: config.cjs --keys)`);
  if (cfg.values.taskIdPattern) { try { new RegExp(cfg.values.taskIdPattern); } catch (e) { w.push(`taskIdPattern 정규식 오류(${cfg.sources.taskIdPattern}): ${e.message} → 기본 ${DEFAULT_TASK_ID} 사용`); } }
  return w;
}
function warnConfig(cfg, label, extra = []) {
  const w = [...configWarnings(cfg), ...extra.filter(Boolean)];
  w.forEach((m) => console.error(`[agent-skills 설정 경고${label ? ' · ' + label : ''}] ${m}`));
  return w;
}
function projectsWarning(proj) {
  return proj && proj.error ? `등록부 읽기 실패(${proj.file}): ${proj.error} → 현재 저장소 기준` : null;
}

module.exports = { KEYS, LEGACY, DEFAULT_TASK_ID, expand, configPath, resolve, gitRoot, loadProjects, makeHubUrl, probe, loadPlaywright, findBrowser, launchBrowser, serveFile, splitCommand, openUrl, openArgs, cmdSafeUrl, taskIdRegex, configWarnings, warnConfig, projectsWarning, PLAYWRIGHT_HINT, defaultOpenCommand };
