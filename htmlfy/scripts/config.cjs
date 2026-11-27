#!/usr/bin/env node
// agent-skills 설정 해석 결과를 출력한다(환경 변수 > 설정 파일 > 기본값).
// 사용: node config.cjs [--skill dcfy|lookfy|htmlfy] [--get <키>] [--keys]
//   --get: 값 하나만 출력(없으면 빈 줄). 에이전트가 SKILL.md 절차에서 경로를 얻을 때 쓴다.
//   --keys: 설정 키·환경 변수·설명 목록.
'use strict';
const env = require('./lib/skills-env.cjs');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const skill = opt('--skill');

if (args.includes('--keys')) {
  const rows = Object.entries(env.KEYS).map(([k, v]) => ({ key: k, env: [...Object.values(env.LEGACY).map((l) => l[k] || []).flat(), ...v.env], desc: v.desc }));
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

const cfg = env.resolve({ skill });
env.warnConfig(cfg, 'config');
const get = opt('--get');
if (get) {
  if (!env.KEYS[get]) { console.error('알 수 없는 키: ' + get + ' (목록: --keys)'); process.exit(2); }
  const v = cfg.values[get];
  console.log(v == null ? '' : Array.isArray(v) ? v.join('\n') : v);
  process.exit(0);
}
const proj = env.loadProjects(cfg);
console.log(JSON.stringify({
  configFile: cfg.file, configFileExists: cfg.fileExists, configFileError: cfg.fileError, unknownKeys: cfg.unknownKeys,
  skill: skill || null,
  values: cfg.values, sources: cfg.sources,
  projects: { source: proj.source, file: proj.file, error: proj.error || null, count: proj.projects.length, ids: proj.projects.map((p) => p.id) },
}, null, 2));
