#!/usr/bin/env node
// lookfy 예시 JSON 생성기(가상의 메모 앱 "새 메모" 버튼 시안). 실제 프로젝트 결정과 무관.
// 사용: node make-examples.cjs  → references/example-5.json, references/example-30.json
// 실제 작업에서는 이 파일을 쓰지 않는다(시안 내용은 프로젝트 원본·사용자 요청에서 직접 작성).
'use strict';
const fs = require('fs');
const path = require('path');

const W = 360, H = 480;
const shapes = {
  fab: (x, y, r, t = '+') => `<circle class="m-acc" cx="${x}" cy="${y}" r="${r}"/><text class="m-on" x="${x}" y="${y + 9}" font-size="26" font-weight="700" text-anchor="middle">${t}</text>`,
  pill: (x, y, w, h, t, on = true) => `<rect class="${on ? 'm-acc' : 'm-item'}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}"/><text class="${on ? 'm-on' : 'm-sub'}" x="${x + w / 2}" y="${y + h / 2 + 5}" font-size="14" font-weight="600" text-anchor="middle">${t}</text>`,
  box: (x, y, w, h, t, on = false) => `<rect class="${on ? 'm-acc' : 'm-item'}" x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/><text class="${on ? 'm-on' : 'm-sub'}" x="${x + 14}" y="${y + h / 2 + 5}" font-size="14">${t}</text>`,
  bar: (y, h, t) => `<rect class="m-bar" x="0" y="${y}" width="${W}" height="${h}"/><text class="m-sub" x="20" y="${y + h / 2 + 5}" font-size="14">${t}</text>`,
  ring: (x, y, w, h) => `<rect class="m-stroke" x="${x}" y="${y}" width="${w}" height="${h}" rx="10" stroke-width="2" stroke-dasharray="6 4"/>`,
  note: (x, y, t) => `<text class="m-sub" x="${x}" y="${y}" font-size="12">${t}</text>`,
};
function svg(label, parts, listTop = 72, count = 5) {
  const items = [];
  for (let i = 0; i < count; i++) {
    const y = listTop + i * 64;
    if (y + 56 > H - 8) break;
    items.push(`<rect class="m-item" x="16" y="${y}" width="328" height="56" rx="10"/><rect class="m-sub" x="30" y="${y + 14}" width="${150 - i * 12}" height="10" rx="5" opacity=".6"/><rect class="m-sub" x="30" y="${y + 32}" width="${220 - i * 18}" height="8" rx="4" opacity=".35"/>`);
  }
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg"><rect class="m-bg" width="${W}" height="${H}"/><rect class="m-bar" width="${W}" height="56"/><text class="m-fg" x="20" y="37" font-size="20" font-weight="700">메모</text>${items.join('')}${parts.join('')}</svg>`;
}
const pct = (x, y, w, h, r) => ({ x: +(x / W * 100).toFixed(1), y: +(y / H * 100).toFixed(1), w: +(w / W * 100).toFixed(1), h: +(h / H * 100).toFixed(1), ...(r != null ? { r } : {}) });

// [이름, 방향(서로 달라야 함), 콘셉트, 그리기, 첫 포인트 영역(px) 또는 null, 점수]
const S = shapes;
const V = [
  ['하단 플로팅 버튼', '떠 있는 원형 버튼', '오른쪽 아래 둥근 + 버튼 하나로 새 메모를 시작합니다.', [S.fab(296, 416, 28)], [264, 384, 64, 64, '50%'], ['좋음', '좋음', '거의 그대로', '낮음']],
  ['상단 큰 입력줄', '목록 위 고정 입력', '목록 위 입력줄을 누르면 바로 씁니다.', [S.box(16, 64, 328, 44, '새 메모 쓰기…', false), S.ring(16, 64, 328, 44)], null, ['매우 좋음', '나쁨', '44px 줄어듦', '낮음'], 116],
  ['하단 입력줄 + 태그', '메신저형 하단 입력', '아래 고정 입력줄과 최근 태그 칩으로 쓰면서 분류합니다.', [S.pill(16, 368, 70, 28, '#일', false), S.pill(94, 368, 70, 28, '#생각', false), S.bar(412, 68, '메모 입력…')], [0, 412, 360, 68, 0], ['매우 좋음', '좋음', '96px 줄어듦', '중간']],
  ['하단 탭 가운데 +', '탭 바 중앙 버튼', '하단 탭 바 가운데 큰 + 버튼으로 다른 탭과 함께 둡니다.', [S.bar(420, 60, ''), S.fab(180, 434, 30)], null, ['좋음', '좋음', '60px 줄어듦', '중간']],
  ['당겨서 새 메모', '제스처(아래로 당기기)', '목록 맨 위에서 아래로 당기면 새 메모가 열립니다.', [S.note(108, 70, '↓ 당겨서 새 메모'), S.ring(16, 52, 328, 28)], null, ['나쁨', '좋음', '그대로', '중간'], 92],
  ['확장형 플로팅 메뉴', '누르면 펼쳐지는 버튼 묶음', '+를 누르면 글·체크리스트·사진 메모 버튼이 위로 펼쳐집니다.', [S.pill(206, 268, 110, 32, '체크리스트'), S.pill(206, 308, 110, 32, '사진 메모'), S.pill(206, 348, 110, 32, '글 메모'), S.fab(296, 416, 28, '×')], [200, 262, 122, 124], ['좋음', '좋음', '거의 그대로', '중간']],
  ['빈 줄 바로 쓰기', '목록 끝 빈 카드', '목록 맨 아래 빈 카드에 바로 적으면 저장됩니다.', [S.box(16, 392, 328, 56, '+ 여기에 바로 쓰기'), S.ring(16, 392, 328, 56)], null, ['보통', '좋음', '56px 줄어듦', '낮음'], 72, 5],
  ['헤더 오른쪽 텍스트 버튼', '글자로 쓴 상단 버튼', '오른쪽 위에 "새 메모" 글자 버튼을 둡니다.', [S.pill(258, 12, 88, 32, '새 메모')], null, ['좋음', '나쁨', '그대로', '매우 낮음']],
  ['길게 눌러 빠른 메뉴', '아이콘 길게 누르기', '앱 아이콘을 길게 눌러 바로 새 메모를 엽니다.', [S.box(60, 160, 240, 120, '', false), S.note(84, 200, '앱 아이콘 빠른 메뉴'), S.pill(84, 222, 192, 36, '+ 새 메모')], null, ['나쁨', '좋음', '그대로', '중간']],
  ['하단 왼쪽 버튼', '왼손 엄지 위치', '왼쪽 아래 둥근 버튼으로 왼손 사용자를 배려합니다.', [S.fab(64, 416, 28)], null, ['좋음', '보통', '거의 그대로', '낮음']],
  ['넓은 하단 버튼', '화면 폭 전체 버튼', '아래에 폭 전체 "새 메모" 버튼을 둡니다.', [S.pill(16, 420, 328, 48, '+ 새 메모')], null, ['매우 좋음', '좋음', '64px 줄어듦', '매우 낮음']],
  ['사이드 가장자리 탭', '화면 오른쪽 가장자리 손잡이', '오른쪽 가장자리 작은 손잡이를 끌면 새 메모가 열립니다.', [`<rect class="m-acc" x="344" y="200" width="16" height="80" rx="6"/>`], null, ['나쁨', '보통', '그대로', '중간']],
  ['음성 메모 버튼', '말로 시작', '마이크 버튼을 눌러 말하면 글로 적어 줍니다.', [S.fab(180, 416, 30, '●')], null, ['좋음', '좋음', '거의 그대로', '높음']],
  ['상단 검색창 겸 입력', '검색과 쓰기 통합', '위 입력창에 쓰다가 Enter면 새 메모, 아래 결과는 검색입니다.', [S.box(16, 64, 328, 40, '찾거나 새로 쓰기', false)], null, ['매우 좋음', '나쁨', '40px 줄어듦', '높음'], 112],
  ['템플릿 카드 줄', '템플릿에서 시작', '목록 위 가로 카드(할 일·회의·일기)를 눌러 시작합니다.', [S.box(16, 64, 100, 48, '할 일'), S.box(124, 64, 100, 48, '회의'), S.box(232, 64, 100, 48, '일기')], null, ['좋음', '보통', '56px 줄어듦', '중간'], 124],
  ['두 번 탭 빈 곳', '빈 공간 두 번 탭', '목록 아래 빈 곳을 두 번 탭하면 새 메모가 열립니다.', [S.note(96, 420, '빈 곳 두 번 탭 → 새 메모')], null, ['나쁨', '좋음', '그대로', '낮음'], 72, 4],
  ['스와이프 업 시트', '아래에서 끌어올리는 시트', '아래 손잡이를 위로 끌면 쓰기 시트가 올라옵니다.', [`<rect class="m-bar" x="0" y="440" width="360" height="40" rx="14"/><rect class="m-sub" x="160" y="450" width="40" height="5" rx="2.5"/>`, S.note(126, 472, '끌어올려 쓰기')], null, ['보통', '좋음', '40px 줄어듦', '중간']],
  ['위젯 바로가기', '홈 화면 위젯', '홈 화면 위젯의 + 로 앱을 열지 않고 씁니다.', [S.box(40, 150, 280, 140, '', false), S.note(60, 180, '홈 화면 위젯'), S.pill(60, 230, 240, 40, '+ 새 메모')], null, ['보통', '좋음', '그대로', '높음']],
  ['상단 아이콘 크게', '현재안 확대', '지금의 오른쪽 위 +를 크기만 키웁니다(48px).', [S.fab(316, 28, 22)], null, ['보통', '나쁨', '그대로', '매우 낮음']],
  ['하단 툴바 버튼', '편집 도구 줄 안 버튼', '하단 툴바(정렬·필터·+) 오른쪽 끝에 +를 둡니다.', [S.bar(424, 56, '정렬 · 필터'), S.pill(280, 436, 64, 32, '+')], null, ['좋음', '좋음', '56px 줄어듦', '낮음']],
  ['대화형 첫 화면', '빈 상태 안내형', '첫 화면 가운데 "무엇을 적을까요?" 입력으로 시작합니다.', [S.note(110, 190, '무엇을 적을까요?'), S.box(40, 206, 280, 44, '여기에 쓰기…')], null, ['매우 좋음', '보통', '목록 숨김', '중간'], 300, 2],
  ['키보드 단축 입력', '외부 키보드 단축키', 'N 키 또는 ⌘N 으로 새 메모(태블릿·키보드 사용자).', [S.pill(120, 420, 120, 36, '⌘N 새 메모', false)], null, ['나쁨', '해당 없음', '그대로', '낮음']],
  ['고정 첫 줄 카드', '목록 첫 칸 고정', '목록 첫 카드 자리를 항상 "+ 새 메모"로 고정합니다.', [S.box(16, 72, 328, 56, '+ 새 메모', true)], null, ['매우 좋음', '나쁨', '56px 줄어듦', '낮음'], 136, 4],
  ['반투명 하단 독', '떠 있는 하단 독', '하단에 떠 있는 둥근 독 안에 검색·+·설정을 둡니다.', [S.pill(70, 420, 220, 44, '검색 · + · 설정', false)], null, ['좋음', '좋음', '거의 그대로', '중간']],
  ['색 점 빠른 생성', '색으로 분류하며 시작', '하단 색 점 4개 중 하나를 누르면 그 색 메모가 생깁니다.', [`<circle class="m-acc" cx="120" cy="440" r="14"/><circle class="m-sub" cx="160" cy="440" r="14"/><circle class="m-fg" cx="200" cy="440" r="14"/><circle class="m-line" cx="240" cy="440" r="14" stroke-width="2"/>`], null, ['보통', '좋음', '거의 그대로', '중간']],
  ['사진 먼저 버튼', '카메라로 시작', '카메라 버튼을 누르면 찍은 사진으로 메모가 시작됩니다.', [S.fab(296, 416, 28, '◎')], null, ['보통', '좋음', '거의 그대로', '높음']],
  ['날짜 헤더 + 버튼', '날짜 묶음마다 추가', '오늘·어제 같은 날짜 머리줄마다 작은 +를 둡니다.', [S.bar(64, 28, '오늘'), S.pill(300, 66, 44, 24, '+')], null, ['보통', '보통', '28px 줄어듦', '중간'], 100],
  ['흔들어 새 메모', '기기 흔들기', '휴대폰을 흔들면 새 메모 화면이 열립니다.', [S.note(118, 440, '흔들면 새 메모 ↯')], null, ['나쁨', '좋음', '그대로', '중간']],
  ['알림 영역 바로가기', '잠금화면·알림 상주', '알림 영역에 상주 바로가기를 두어 어디서나 씁니다.', [S.box(16, 8, 328, 40, '메모  ·  + 바로 쓰기', true)], null, ['보통', '좋음', '그대로', '높음']],
  ['오른쪽 위 펜 아이콘 + 라벨', '아이콘과 글자 조합(상단)', '오른쪽 위에 펜 아이콘과 "쓰기" 글자를 함께 둡니다.', [S.pill(262, 12, 84, 32, '✎ 쓰기')], null, ['좋음', '나쁨', '그대로', '매우 낮음']],
];
if (V.length !== 30) throw new Error('예시는 30개여야 함: ' + V.length);
const CRIT = ['찾기 쉬움', '한 손 조작', '목록 공간', '구현 난이도'];

function variant(v, i, prefix) {
  const [name, direction, concept, parts, area, sc, listTop, count] = v;
  const id = String(i + 1).padStart(2, '0');
  return {
    id, name, direction, concept,
    features: [`위치·형태: ${direction}`, '누르면 빈 메모 편집 화면으로 이동', '기존 목록 정렬은 그대로'],
    pros: [`찾기 쉬움 ${sc[0]}, 한 손 조작 ${sc[1]}`],
    cons: [`목록 공간: ${sc[2]}`, `구현 난이도 ${sc[3]}`],
    points: [
      Object.assign({ text: `${name} — 처음 보는 사람이 바로 찾는지` }, area ? { area: pct(...area) } : {}),
      { text: '목록을 읽을 때 방해되지 않는지' },
    ],
    scores: Object.fromEntries(CRIT.map((c, k) => [c, sc[k]])),
    mock: { svg: svg(`시안 ${id}: ${concept}`, parts, listTop, count) },
  };
}
function doc(n, file) {
  const variants = V.slice(0, n).map((v, i) => variant(v, i));
  const data = {
    meta: { title: `[예시] 메모 앱 "새 메모" 버튼 시안 ${n}개`, subtitle: 'lookfy 예시 — 가상의 앱이며 실제 결정과 무관', date: '2026-11-25', taskId: 'OPS-AGENCY-MOCKUP_DOC_RULE-0001', project: 'agency', count: n, round: 1, multi: false },
    summary: { recommend: [{ id: '01', reason: '엄지로 바로 닿고 목록 공간을 거의 쓰지 않습니다.' }, { id: '03', reason: '쓰기·분류가 한 번에 되지만 화면 높이를 96px 씁니다.' }] },
    criteria: CRIT,
    current: {
      name: '상단 + 아이콘', concept: '오른쪽 위 작은 + 아이콘으로 새 메모를 만듭니다.', direction: '현재 화면', problemsLabel: '예시 피드백',
      scores: { '찾기 쉬움': '보통', '한 손 조작': '나쁨', '목록 공간': '그대로', '구현 난이도': '—' },
      problems: [{ text: '+ 아이콘이 작고 화면 위 끝이라 한 손으로 닿기 어렵습니다.', area: pct(300, 10, 40, 36) }, { text: '엄지가 편한 화면 아래쪽에는 조작이 없습니다.', area: pct(0, 400, 360, 80, 0) }],
      mock: { svg: svg('현재안: 오른쪽 위 작은 + 아이콘', [`<rect class="m-item" x="300" y="10" width="40" height="36" rx="8"/><text class="m-fg" x="320" y="36" font-size="22" text-anchor="middle">+</text>`]) },
    },
    variants,
  };
  fs.writeFileSync(path.join(__dirname, file), JSON.stringify(data, null, 2) + '\n');
}
doc(5, 'example-5.json');
doc(30, 'example-30.json');
console.log('ok example-5.json, example-30.json');
