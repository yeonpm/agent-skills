#!/usr/bin/env node
// lookfy 시안 수 검사: 문서의 선택 가능한 시안 카드(.mp-card[data-mp-id]) 수가 요청 개수 N과 같은지, 번호가 고유한지 확인한다.
// 사용: node check-count.cjs <문서.html> [N]   N 생략 시 문서의 <meta name="lookfy-count">. 다르면 실패(exit 1).
'use strict';
const fs = require('fs');
const f = process.argv[2];
if (!f || !fs.existsSync(f)) { console.error('usage: node check-count.cjs <file.html> [N]'); process.exit(2); }
const raw = fs.readFileSync(f, 'utf8');
// 인라인 CSS·JS 주석 속 예시 마크업은 세지 않는다.
const html = raw.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
const metaN = (html.match(/<meta name="lookfy-count" content="(\d+)">/) || [])[1];
const N = Number(process.argv[3] || metaN);
if (!Number.isInteger(N) || N < 1) { console.error('N을 알 수 없음: 인자 또는 <meta name="lookfy-count"> 필요'); process.exit(2); }
const ids = [...html.matchAll(/<[a-z]+\b[^>]*class="[^"]*\bmp-card\b[^"]*"[^>]*data-mp-id="([^"]+)"/g)].map((m) => m[1]);
const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
const ok = ids.length === N && dup.length === 0 && (!metaN || Number(metaN) === N);
console.log(JSON.stringify({ ok, file: f, requested: N, metaCount: metaN ? Number(metaN) : null, cards: ids.length, duplicates: dup, first: ids[0] || null, last: ids[ids.length - 1] || null }, null, 2));
process.exit(ok ? 0 : 1);
