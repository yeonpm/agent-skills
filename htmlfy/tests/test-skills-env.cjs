#!/usr/bin/env node
// skills-env.cjs 회귀 테스트(브라우저·네트워크 불필요): 임시 서버 안전 장치, Windows cmd URL 이스케이프, 설정 우선순위·경고.
// 사용: node htmlfy/tests/test-skills-env.cjs   (실패 시 exit 1)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');
const env = require('../scripts/lib/skills-env.cjs');

const results = [];
const check = (name, ok, extra) => results.push({ name, ok: !!ok, ...(extra ? { extra } : {}) });

function get(port, rawPath, host) {
  return new Promise((done) => {
    const req = http.request({ host: '127.0.0.1', port, path: rawPath, method: 'GET', headers: host ? { host } : {} }, (res) => {
      let body = ''; res.on('data', (c) => (body += c)); res.on('end', () => done({ status: res.statusCode, body }));
    });
    req.on('error', (e) => done({ status: 0, error: e.code }));
    req.end();
  });
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-env-test-'));
  try {
    // 폴더 구조: <tmp>/docs/doc.html(서빙 대상), <tmp>/docs-secret/k.txt(형제, 접근 불가), <tmp>/outside.txt
    fs.mkdirSync(path.join(tmp, 'docs', 'sub'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'docs-secret'));
    fs.writeFileSync(path.join(tmp, 'docs', 'doc.html'), '<p>ok</p>');
    fs.writeFileSync(path.join(tmp, 'docs', 'sub', 'a.txt'), 'sub');
    fs.writeFileSync(path.join(tmp, 'docs-secret', 'k.txt'), 'SECRET');
    fs.writeFileSync(path.join(tmp, 'outside.txt'), 'OUTSIDE');
    try { fs.symlinkSync(path.join(tmp, 'outside.txt'), path.join(tmp, 'docs', 'link.txt')); } catch {}

    const { server, url } = await env.serveFile(path.join(tmp, 'docs', 'doc.html'));
    const port = server.address().port;
    const r = {
      doc: await get(port, '/doc.html'),
      sub: await get(port, '/sub/a.txt'),
      siblingEncoded: await get(port, '/..%2fdocs-secret%2fk.txt'),
      siblingDots: await get(port, '/../docs-secret/k.txt'),
      parentEncoded: await get(port, '/%2e%2e/outside.txt'),
      symlinkOut: await get(port, '/link.txt'),
      badEncoding: await get(port, '/%zz'),
      nul: await get(port, '/doc.html%00'),
      dir: await get(port, '/sub'),
      foreignHost: await get(port, '/doc.html', 'evil.example:' + port),
      localhostHost: await get(port, '/doc.html', 'localhost:' + port),
    };
    const after = await get(port, '/doc.html');
    server.close();
    check('serve-200', r.doc.status === 200 && r.doc.body === '<p>ok</p>' && /^http:\/\/127\.0\.0\.1:\d+\/doc\.html$/.test(url), r.doc.status);
    check('serve-subfolder-200', r.sub.status === 200 && r.sub.body === 'sub', r.sub.status);
    check('traversal-sibling-encoded-404', r.siblingEncoded.status === 404 && !r.siblingEncoded.body.includes('SECRET'), r.siblingEncoded.status);
    check('traversal-sibling-dots-404', r.siblingDots.status === 404 && !r.siblingDots.body.includes('SECRET'), r.siblingDots.status);
    check('traversal-parent-encoded-404', r.parentEncoded.status === 404, r.parentEncoded.status);
    check('symlink-outside-404', r.symlinkOut.status === 404, r.symlinkOut.status);
    check('bad-encoding-400', r.badEncoding.status === 400, r.badEncoding.status);
    check('nul-byte-400', r.nul.status === 400, r.nul.status);
    check('directory-404', r.dir.status === 404, r.dir.status);
    check('foreign-host-403', r.foreignHost.status === 403, r.foreignHost.status);
    check('localhost-host-200', r.localhostHost.status === 200, r.localhostHost.status);
    check('alive-after-bad-requests', after.status === 200, after.status);

    // Windows cmd start: 메타문자 처리
    check('cmd-file-url-encoded', env.cmdSafeUrl('file:///C:/a%20b/x&y|z^"w.html') === 'file:///C:/a%20b/x%26y%7Cz%5E%22w.html');
    check('cmd-http-url-escaped', env.cmdSafeUrl('http://127.0.0.1:8080/f/p/a.html?x=1&y=2') === 'http://127.0.0.1:8080/f/p/a.html?x=1^&y=2');
    const winArgs = env.openArgs({ values: { openCommand: 'cmd /c start ""' } }, 'file:///C:/d/a&b.html');
    check('cmd-open-args', JSON.stringify(winArgs) === JSON.stringify(['cmd', '/c', 'start', '', 'file:///C:/d/a%26b.html']), winArgs);
    const macArgs = env.openArgs({ values: { openCommand: 'open -a "Google Chrome"' } }, 'file:///a&b.html');
    check('non-cmd-open-args-unchanged', JSON.stringify(macArgs) === JSON.stringify(['open', '-a', 'Google Chrome', 'file:///a&b.html']), macArgs);

    // 설정 우선순위·경고(자식 프로세스로 환경 격리)
    const cfgFile = path.join(tmp, 'config.json');
    const run = (envVars, code) => {
      const res = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: tmp, AGENT_SKILLS_CONFIG: cfgFile, ...envVars } });
      return { out: res.stdout.trim(), err: res.stderr.trim() };
    };
    const lib = JSON.stringify(require.resolve('../scripts/lib/skills-env.cjs'));
    fs.writeFileSync(cfgFile, JSON.stringify({ hubUrl: 'http://file:1/', taskIdPattern: '([', projectsJson: '~/p.json' }));
    const a = run({}, `const e=require(${lib});const c=e.resolve({skill:'dcfy'});e.warnConfig(c,'t');console.log(JSON.stringify([c.values.hubUrl,c.sources.hubUrl,c.values.projectsJson,e.taskIdRegex(c).source]))`);
    const [hub, hubSrc, pj, rx] = JSON.parse(a.out);
    check('config-file-used-and-tilde', hub === 'http://file:1' && hubSrc === 'config' && pj === path.join(tmp, 'p.json'), a.out);
    check('bad-regex-warns-and-falls-back', rx === env.DEFAULT_TASK_ID.replace(/\//g, '\\/') && /taskIdPattern 정규식 오류/.test(a.err), a.err);
    const b = run({ AGENT_SKILLS_HUB_URL: 'http://env:2', DECISION_DOC_HUB: 'http://legacy:3' }, `const e=require(${lib});console.log(e.resolve({skill:'dcfy'}).values.hubUrl,e.resolve({skill:'lookfy'}).values.hubUrl)`);
    check('env-over-file-legacy-first', b.out === 'http://legacy:3 http://env:2', b.out);
    const c = run({ AGENT_SKILLS_HUB_URL: '' }, `const e=require(${lib});console.log(String(e.resolve().values.hubUrl))`);
    check('empty-env-disables', c.out === 'null', c.out);
    fs.writeFileSync(cfgFile, '{ broken');
    const d = run({}, `const e=require(${lib});const c=e.resolve();e.warnConfig(c,'t');console.log(String(c.values.hubUrl))`);
    check('broken-config-warns', d.out === 'null' && /설정 파일 읽기 실패/.test(d.err), d.err);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const ok = results.every((x) => x.ok);
  console.log(JSON.stringify({ ok, passed: results.filter((x) => x.ok).length, total: results.length, failed: results.filter((x) => !x.ok) }, null, 2));
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
