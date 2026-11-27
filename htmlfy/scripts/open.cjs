#!/usr/bin/env node
// 문서를 사용자 브라우저로 띄운다(OS별 명령 또는 설정 openCommand).
// 사용: node open.cjs <URL | 문서 파일> [--serve] [--print] [--skill dcfy|lookfy|htmlfy]
//   URL이면 그대로 연다.
//   파일이면: 허브(hubUrl)가 설정돼 있고 응답하며 등록 프로젝트의 docs/·knowledge/ 아래 파일이면 허브 URL,
//            아니면 file:// URL로 연다.
//   --serve: 허브 대신 그 파일 폴더를 임시 로컬 서버(127.0.0.1, 빈 포트)로 서빙해 연다. 보안 컨텍스트라
//            클립보드 '복사' 버튼(dcfy·lookfy)이 동작한다. Ctrl+C(또는 프로세스 종료)까지 서버가 떠 있으므로 백그라운드로 실행한다.
//   --print: 열지 않고 결정한 URL·명령만 출력한다.
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const env = require('./lib/skills-env.cjs');

const args = process.argv.slice(2);
const skillAt = args.indexOf('--skill');
const skill = skillAt >= 0 ? args[skillAt + 1] : undefined;
const target = args.find((a, i) => !a.startsWith('--') && (skillAt < 0 || i !== skillAt + 1));
if (!target) { console.error('usage: node open.cjs <URL | file> [--serve] [--print] [--skill <name>]'); process.exit(2); }
const print = args.includes('--print');
const serve = args.includes('--serve');

(async () => {
  const cfg = env.resolve({ skill });
  env.warnConfig(cfg, 'open');
  let url, via, server = null;
  if (/^https?:\/\//.test(target) || /^file:/.test(target)) { url = target; via = 'url'; }
  else {
    const abs = path.resolve(target);
    if (!fs.existsSync(abs)) { console.error('파일 없음: ' + abs); process.exit(2); }
    if (serve) {
      ({ server, url } = await env.serveFile(abs));
      via = 'temporary-server';
    } else {
      const hub = cfg.values.hubUrl;
      const hubState = hub ? await env.probe(hub + '/') : { ok: false, reason: 'not-configured' };
      const hubLink = hubState.ok ? env.makeHubUrl(hub, env.loadProjects(cfg, [abs]).projects)(abs) : null;
      if (hubLink) { url = hubLink; via = 'hub'; }
      else {
        url = pathToFileURL(abs).href; via = 'file';
        if (hub && !hubState.ok) console.error(`허브(${hub}) 응답 없음(${hubState.reason || hubState.status}) → file://로 연다.` + (cfg.values.hubStartCommand ? ` 허브 시작: ${cfg.values.hubStartCommand}` : ''));
        else if (hub) console.error('허브가 서빙하지 않는 위치(등록 프로젝트의 docs/·knowledge/ 밖) → file://로 연다.');
      }
    }
  }
  const command = print ? env.openArgs(cfg, url) : env.openUrl(cfg, url);
  console.log(JSON.stringify({ url, via, opened: !print, command, openCommandSource: cfg.sources.openCommand }, null, 2));
  if (server) {
    if (print) { server.close(); return; }
    console.error('임시 서버 실행 중: ' + url + ' (종료: Ctrl+C)');
    const stop = () => { server.close(); process.exit(0); };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
  }
})().catch((e) => { console.error(e); process.exit(2); });
