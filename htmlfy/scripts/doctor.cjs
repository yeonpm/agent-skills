#!/usr/bin/env node
// agent-skills 의존 점검: Node·Python 버전, 설정 해석 결과, 등록부·운영 저장소 템플릿, 문서 허브, playwright·브라우저, 스킬 설치 링크.
// 사용: node doctor.cjs [--json] [--no-launch] [--only a,b]
//   --no-launch: 브라우저를 실제로 띄워 보는 검사를 건너뛴다.
//   --only: 일부만 설치한 경우(install.sh --only) 나머지 스킬의 미연결을 경고 대신 정보로 표시한다.
// 종료 코드: 0 = 필수(Node) 통과(선택 연동 경고는 있어도 됨), 1 = 필수 실패.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const env = require('./lib/skills-env.cjs');

const asJson = process.argv.includes('--json');
const noLaunch = process.argv.includes('--no-launch');
const onlyAt = process.argv.indexOf('--only');
const only = onlyAt >= 0 ? String(process.argv[onlyAt + 1] || '').split(',').filter(Boolean) : null;
const REPO = path.resolve(__dirname, '..', '..');
const tilde = (p) => (typeof p === 'string' && p.startsWith(os.homedir()) ? '~' + p.slice(os.homedir().length) : p);
const checks = [];
const add = (area, status, detail, fix) => checks.push({ area, status, detail, ...(fix ? { fix } : {}) });

function which(bin) {
  if (path.isAbsolute(bin)) return fs.existsSync(bin) ? bin : null;
  const r = process.platform === 'win32' ? spawnSync('where', [bin], { encoding: 'utf8' }) : spawnSync('sh', ['-c', 'command -v "$1"', 'sh', bin], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split('\n')[0].trim() : null;
}

(async () => {
  // Node
  const major = Number(process.versions.node.split('.')[0]);
  add('node', major >= 18 ? 'ok' : 'fail', `node ${process.versions.node} (${tilde(process.execPath)})`, major >= 18 ? null : 'Node.js 18 이상 필요');

  // Python (task-token-report)
  const py = ['python3', 'python'].map((b) => ({ b, r: spawnSync(b, ['--version'], { encoding: 'utf8' }) })).find((x) => x.r.status === 0);
  add('python', py ? 'ok' : 'warn', py ? (py.r.stdout || py.r.stderr).trim() + ` (${py.b})` : 'python3 없음', py ? null : 'task-token-report에 Python 3.8+ 필요(표준 라이브러리만 사용)');

  // 설정
  const cfg = env.resolve();
  if (cfg.fileError) add('config', 'warn', `설정 파일 읽기 실패 ${tilde(cfg.file)}: ${cfg.fileError}`, 'JSON 형식을 고친다(무시하고 기본값으로 동작 중)');
  else add('config', 'ok', cfg.fileExists ? `설정 파일 ${tilde(cfg.file)}` : `설정 파일 없음(${tilde(cfg.file)}) → 기본값으로 동작`);
  if (cfg.unknownKeys.length) add('config', 'warn', '알 수 없는 키: ' + cfg.unknownKeys.join(', '), 'node config.cjs --keys 로 키 목록 확인');
  try { new RegExp(cfg.values.taskIdPattern); } catch (e) { add('config', 'warn', `taskIdPattern 정규식 오류(${cfg.sources.taskIdPattern}): ${e.message} → 기본값 사용`, '정규식을 고친다'); }
  for (const s of ['dcfy', 'lookfy']) {
    const sc = env.resolve({ skill: s });
    if (sc.sources.hubUrl.startsWith('env:') && sc.sources.hubUrl !== cfg.sources.hubUrl) add('config', 'info', `${s} hubUrl = ${sc.values.hubUrl} (${sc.sources.hubUrl})`);
  }

  // 등록부
  const proj = env.loadProjects(cfg);
  if (cfg.values.projectsJson && proj.error) add('projects', 'warn', `등록부 읽기 실패 ${tilde(cfg.values.projectsJson)}: ${proj.error} → 현재 저장소 기준`, '설정 projectsJson 경로 확인');
  else if (proj.source === 'projectsJson') add('projects', 'ok', `등록부 ${tilde(proj.file)} (${proj.projects.length}개)`);
  else add('projects', 'info', `등록부 없음 → 현재 git 저장소 기준(${proj.projects.map((p) => p.id).join(', ') || '저장소 밖'})`);

  // 운영 저장소 템플릿(선택)
  if (cfg.values.agencyDir) {
    const want = ['templates/agent-handoff.md', 'templates/agent-report.md'];
    const miss = want.filter((f) => !fs.existsSync(path.join(cfg.values.agencyDir, f)));
    add('agency', miss.length ? 'warn' : 'ok', `${tilde(cfg.values.agencyDir)} (${cfg.sources.agencyDir})` + (miss.length ? ' — 없음: ' + miss.join(', ') + ' → 내장 기본 양식 사용' : ' — 인계·보고 양식 있음'));
  } else add('agency', 'info', '운영 저장소 없음 → 인계·보고는 htmlfy/references/default-handoff.md 내장 양식');

  // 허브(선택)
  if (cfg.values.hubUrl) {
    const h = await env.probe(cfg.values.hubUrl + '/');
    add('hub', h.ok ? 'ok' : 'warn', `${cfg.values.hubUrl} (${cfg.sources.hubUrl}) → ${h.ok ? 'HTTP ' + h.status : '응답 없음 ' + (h.reason || h.status)}`, h.ok ? null : (cfg.values.hubStartCommand ? '시작: ' + cfg.values.hubStartCommand : '허브를 켜거나, 없이 쓰려면 hubUrl을 비운다(file:// 또는 open.cjs --serve)'));
  } else add('hub', 'info', '허브 미설정 → 문서는 file://로 열고, 클립보드 테스트·--serve는 임시 로컬 서버(127.0.0.1) 사용');

  // 열기 명령
  const [bin] = env.splitCommand(cfg.values.openCommand);
  const binPath = bin === 'cmd' ? 'cmd' : which(bin);
  add('open', binPath ? 'ok' : 'warn', `${cfg.values.openCommand} (${cfg.sources.openCommand})`, binPath ? null : `${bin} 없음 → 설정 openCommand 지정`);

  // playwright·브라우저
  const pw = env.loadPlaywright(cfg);
  if (!pw.chromium) add('playwright', 'warn', 'playwright-core 없음 (htmlfy verify, lookfy check-focus·picker 테스트, dcfy 클립보드 테스트에 필요)', env.PLAYWRIGHT_HINT);
  else {
    add('playwright', 'ok', `playwright-core ${pw.version || '?'} (${pw.from}: ${tilde(pw.location)})`);
    const exe = env.findBrowser(cfg, pw.chromium);
    if (!exe.path) add('browser', 'warn', '브라우저 실행 파일을 찾지 못함', 'npx playwright-core install chromium(네트워크) 또는 Chrome 설치, 또는 설정 browserExecutable');
    else if (noLaunch) add('browser', 'ok', `${tilde(exe.path)} (${exe.from}, 실행 검사 생략)`);
    else {
      try {
        const b = await pw.chromium.launch({ executablePath: exe.path });
        const v = b.version(); await b.close();
        add('browser', 'ok', `${tilde(exe.path)} (${exe.from}) — 실행 확인 ${v}`);
      } catch (e) {
        add('browser', 'warn', `${tilde(exe.path)} (${exe.from}) 실행 실패: ${String(e.message || e).split('\n')[0]}`, '설정 browserExecutable로 다른 Chromium 계열 지정');
      }
    }
  }

  // 스킬 설치 링크
  const skillsDir = process.env.CLAUDE_SKILLS_DIR ? env.expand(process.env.CLAUDE_SKILLS_DIR) : path.join(os.homedir(), '.claude', 'skills');
  const skills = fs.readdirSync(REPO).filter((d) => fs.existsSync(path.join(REPO, d, 'SKILL.md')));
  const linked = skills.filter((s) => {
    try {
      const dest = path.join(skillsDir, s);
      if (fs.realpathSync(dest) === fs.realpathSync(path.join(REPO, s))) return true;
      return fs.readFileSync(path.join(dest, '.agent-skills-copy'), 'utf8').trim() === fs.realpathSync(REPO); // install.sh --copy
    } catch { return false; }
  });
  const wanted = only ? skills.filter((s) => only.includes(s)) : skills;
  const missing = wanted.filter((s) => !linked.includes(s));
  const skipped = skills.filter((s) => !wanted.includes(s) && !linked.includes(s));
  add('install', missing.length ? 'warn' : 'ok', `${tilde(skillsDir)}: ${linked.filter((s) => wanted.includes(s)).length}/${wanted.length} 연결` + (missing.length ? ' — 미연결: ' + missing.join(', ') : ''), missing.length ? `${tilde(path.join(REPO, 'install.sh'))} 실행` : null);
  if (skipped.length) add('install', 'info', '--only로 설치하지 않은 스킬(정상): ' + skipped.join(', '));
  const needsHtmlfy = wanted.filter((s) => s === 'dcfy' || s === 'lookfy');
  if (needsHtmlfy.length && !linked.includes('htmlfy')) add('install', 'warn', `${needsHtmlfy.join(', ')}는 htmlfy가 같은 폴더에 있어야 한다(공용 scripts/lib)`, 'install.sh --only에 htmlfy 추가');

  const summary = { ok: !checks.some((c) => c.status === 'fail'), warnings: checks.filter((c) => c.status === 'warn').length };
  if (asJson) {
    console.log(JSON.stringify({ ...summary, repo: tilde(REPO), checks, config: { file: tilde(cfg.file), values: cfg.values, sources: cfg.sources } }, null, 2));
  } else {
    const mark = { ok: 'ok  ', warn: 'WARN', fail: 'FAIL', info: 'info' };
    for (const c of checks) {
      console.log(`[${mark[c.status]}] ${c.area.padEnd(10)} ${c.detail}`);
      if (c.fix) console.log(`             → ${c.fix}`);
    }
    console.log('\n해석된 설정(값 · 출처):');
    for (const k of Object.keys(env.KEYS)) {
      const v = cfg.values[k];
      console.log(`  ${k.padEnd(18)} ${v == null || (Array.isArray(v) && !v.length) ? '-' : Array.isArray(v) ? v.map(tilde).join(', ') : tilde(v)}  · ${cfg.sources[k]}`);
    }
    console.log(`\n결과: ${summary.ok ? '필수 통과' : '필수 실패'} · 경고 ${summary.warnings}건`);
  }
  process.exit(summary.ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
