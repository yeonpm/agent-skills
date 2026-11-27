---
name: lookfy
description: 디자인 시안·목업을 요청한 개수 그대로(기본 30개) 서로 확실히 다른 방향으로 만들어, 시안 카드마다 선택 버튼·의견 입력이 있고 고를 때마다 하단 프롬프트가 실시간 작성되고 '복사' 버튼으로 복사하는 단독 HTML 시안 문서로 대상 저장소 docs/design에 저장·검증·로컬 커밋하고 로컬 문서 허브(설정 시) 또는 임시 로컬 서버로 띄운다. 사용자가 "lookfy", "/lookfy", "/lookfy 10 캐모리 설정 화면", "시안 N개", "시안 뽑아줘/보여줘/만들어줘", "시안 몇 개 html로", "디자인 시안", "목업 여러 개", "2차 시안" 등 시안을 요청하면 반드시 이 스킬을 쓴다. 시안이 아닌 조사·스펙·보고서·전후 비교 문서(→ htmlfy), 시안 하나를 실제 서비스 코드에 구현하는 요청, 결정 대기 모음(→ dcfy)은 제외.
---

# lookfy — 시안을 요청한 개수 그대로 만들어 고르게 하기

호출 예: `/lookfy 10 캐모리 설정 화면`, `/lookfy 소곤 홈 카드`(개수 없음 → 30개), `/lookfy 2차 8 캐모리 설정 화면`.
- **개수 N**: 사용자가 준 숫자 그대로. 없으면 **30**. 정확히 N개를 만든다(늘리거나 줄이거나 합치지 않는다). 빌드·검사 스크립트가 카드 수 ≠ N이면 실패시킨다.
- 시안 규칙의 원본은 이 문서다. htmlfy·역할 파일은 이 문서를 가리키기만 한다.

## 환경
htmlfy "환경" 절과 같다: 설정은 `node ~/.claude/skills/htmlfy/scripts/config.cjs`(키: `projectsJson`·`agencyDir`·`hubUrl`(옛 `LOOKFY_HUB`)·`taskIdPattern`·`openCommand`·`excludePaths`·`nodeSetup`), 점검은 `doctor.cjs`. htmlfy 스킬이 같은 스킬 폴더에 있어야 한다(공용 스크립트·favicon·verify).

## 0. 누가 쓰는가
- 운영 저장소에 위임 규칙이 있으면 따른다. 작성자 환경: 접수 비서는 직접 만들지 않고 디자인 계열 하위 에이전트(Agent 도구, 역할 파일 `<agencyDir>/agents/visual-design.md`·`ux-design.md`)에 `<agencyDir>/templates/agent-handoff.md` 양식으로 위임한다. 역할 파일·양식이 없으면 htmlfy `references/default-handoff.md`를 쓰고, 위임 구조가 없으면 한 에이전트가 직접 1~5단계를 수행한다.
- 인계에 반드시: 작업 ID, 대상 저장소 경로, 그 저장소에서 읽을 문서(AGENTS.md/CLAUDE.md, 디자인 시스템·관련 결정 기록), **개수 N**(사용자 원문 그대로, 없으면 30), 사용자 원문과 출처, 라운드(이전 시안 문서 경로·번호), 1~6단계와 완료 조건, 보고 양식(`<agencyDir>/templates/agent-report.md` 또는 내장 양식).
- N이 크면(20 이상) 실행 에이전트가 하위 에이전트에 묶음(예 10개씩)으로 나눠 병렬로 만들 수 있다. 이때 묶음마다 **방향 목록을 먼저 확정해 나눠 주고**(겹침 방지), 결과는 한 mockups.json → **최종 문서 하나**로 합친다. 합친 뒤 방향 중복이 있으면 비슷한 시안을 합치지 말고 다른 방향으로 **교체**해 N개를 유지한다.

## 1. 대상 저장소와 저장 위치
- 등록부(설정 `projectsJson`)가 있으면 그 `path`로 저장소를 찾고, 없으면 현재 git 저장소에 둔다. 설정 `excludePaths` 하위는 쓰지 않는다. 작업 전 경로·브랜치·미커밋 변경을 확인하고 남의 변경은 건드리지 않는다.
- 파일: `docs/design/YYYY-MM-DD-<slug>.json`(원본 데이터) + 같은 이름 `.html`(빌드 결과) + 필요하면 `docs/design/<slug>/img/`(렌더 이미지). 날짜는 KST. 허브는 `docs/`·`knowledge/` 아래만 서빙한다.

## 2. 시안 문서 규칙 (원본)
htmlfy 2절 공통 규칙(한국어, 단독 실행·외부 요청 0, 다크모드, 390px 가로 넘침 0, 근거·출처, `[사용자 확인]`/`[제안]` 배지, favicon, 비밀값 금지, 하단에 작성일·작업 ID·원본 경로)을 따르고 아래를 더한다. 템플릿·빌드가 대부분을 자동으로 만든다.
- **핵심 요약**: 시안 수(N, 번호 범위), 추천 1~2개와 이유 한 줄씩, 사용자 할 일(카드의 선택 버튼으로 고르고 의견 적기 → 하단 프롬프트가 작성되면 '복사' 버튼으로 복사 → 대화창에 붙여 넣기).
- **같은 기준 비교표**: 현재안(있으면) + 모든 시안을 같은 열(예: 찾기 쉬움·한 손 조작·공간·구현 난이도·추천)로 한 표에. 이름은 카드 앵커로 연결.
- **현재안 카드**(있으면): 무엇이 문제인지를 짚는다. 시안과 같은 크기·조건으로 렌더한다.
- **시안 카드**(시안마다): 번호·이름, 한 줄 콘셉트, 방향, 특징 2~4개, 장점 / 고려할 점, **봐야 할 포인트** 2~4개("무엇을 보고 무엇을 판단할지" 한 문장, 예 "버튼 위치 — 엄지가 편하게 닿는지").
- **서로 확실히 다른 방향**: 시안마다 `direction`(한 줄)이 달라야 한다. 색·문구만 바꾼 변형으로 개수를 채우지 않는다. 먼저 N개의 방향 목록(배치·구조·상호작용·밀도·정보 위계·톤 등 축을 섞어)을 만든 뒤 그린다. 이름·방향·콘셉트 중복은 build가 실패시킨다.
- **선택 버튼 + 의견 입력(필수, 2026-11-25 사용자 지시)**: 카드마다 "이 시안 선택" 버튼(기본 단일 선택, 다시 누르면 해제, `meta.multi`면 복수)과 시안별 의견 칸. 선택하지 않은 시안에도 의견을 적을 수 있다. 문서 끝에 전체 의견 칸 1개.
- **하단 프롬프트 패널(필수, dcfy와 같은 동작)**: 자동 복사는 없다(사용자 지시 2026-11-27: 선택·입력으로 클립보드가 바뀌지 않는다). '복사' 버튼을 누르면 `navigator.clipboard`로 복사(실패 시 execCommand 폴백), 수동 복사 성공/실패 토스트, 복사·초기화·접기 버튼, localStorage 유지, 패널이 카드 버튼·입력을 가리지 않게 아래 여백 자동 확보. 프롬프트 형식:
  ```
  시안 선택 <문서 제목> <날짜>
  문서: <허브 URL> (원본 <경로>) · 작업 <ID>
  선택: <번호> <이름>            ← 복수면 여러 줄, 없으면 "선택 없음"
  [<번호> <이름>] 의견: …        ← 의견 단 시안마다(선택 안 한 시안 포함), 여러 줄은 들여쓰기
  전체 의견: …
  이 선택으로 진행해줘
  ```
- **포인트 버튼(필요한 경우에만)**: 사용자 지시(2026-11-25) "포인트 버튼은 필요한 경우에만 동작하면 돼". 시안이 복잡하거나 차이가 작아 말로 찾기 어려울 때, 한 화면에 볼 곳이 여러 군데일 때만 포인트에 `area`를 준다 → 누르면 해당 영역 강조(바깥 딤 + 테두리 + 번호, 그 시안으로 스크롤), 다시 누르거나 Esc로 해제. 단순한 시안은 텍스트 목록만.
- **번호 고정**: 라운드 1은 01..N. 한번 정한 번호는 바꾸지 않는다(프롬프트·다음 라운드에서 그대로 쓰임). 라운드 2 이상은 이어 번호(`numbering: "continue"`, 1차 01~30 → 2차 31~) 또는 라운드 접두(`"prefix"`, R2-01~).
- **라운드 2 이상**: 사용자 원문 피드백 반영표(원문 → 반영 위치·방식, `[사용자 확인]` + 날짜·출처)와 **조합 분석**(요소별 해결하는 문제 · 부딪히는 점 · 어떻게 조합했는지). 좋다고 한 요소를 무작정 합치지 않는다(2026-11-24 사용자: "무작정 조합하지말고 분석해서 시안에 잘 조합해서 녹여줘"). 원문에 없는데 넣은 요소는 `[제안]`(`proposal: true`)과 이유.
- **글자 넘침 0**: 시안 이미지·목업 안 문구가 모든 언어·변형에서 잘리지 않아야 한다(실제 폰트로 측정, 넘치면 실패). 보고에 "넘침 0 (언어·조합 수)".
- 카드가 10개 이상이면 카드 그리드(데스크톱 여러 열, 휴대폰 한 줄씩)로 자동 전환된다.

## 3. 만들기 (손코딩 최소화)
1. `references/schema.md` 형식으로 `mockups.json`을 쓴다(`meta.count` = N). 목업은 인라인 SVG(색 클래스 `m-*`로 다크모드 자동), 렌더 이미지(`img`), HTML 목업 중 하나.
2. 빌드: 스키마·개수·번호·방향 중복을 검사하고 템플릿 `assets/template.html`에 부품을 인라인으로 넣어 HTML을 만든다. 실패 메시지대로 JSON을 고친다(개수를 맞추려고 시안을 합치거나 빼지 않는다).
```bash
# (설정 nodeSetup이 있으면 먼저 실행)
node ~/.claude/skills/lookfy/scripts/build.cjs <저장소>/docs/design/YYYY-MM-DD-<slug>.json
```
- 빌드를 쓰지 않고 손으로 쓰는 문서도 같은 부품을 인라인으로 붙인다: `assets/focus-points.css/js`(포인트 버튼), `assets/mockup-picker.css/js`(선택·의견·하단 프롬프트). 마크업은 `<article class="mp-card" data-mp-id="01" data-mp-name="이름"> … <div class="mp-slot"></div></article>`, 전체 의견 자리 `<div class="mp-overall"></div>`(없으면 main 끝 자동), 메타 `<meta name="mp-title|mp-date|mp-task|mp-path|mp-url|mp-multi" content="…">`, `<meta name="lookfy-count" content="N">`. 포인트 영역은 `.fp-stage` 안 `<span class="fp-area" data-focus="v01-1" data-no="1" style="--x:72%;--y:79%;--w:20%;--h:15%">` + 버튼 `<button class="fp-btn" data-target="v01-1">`(좌표는 stage 기준 %, 둥근 영역 `--r:50%`).

## 4. 검증 (모두 통과해야 완료)
```bash
S=~/.claude/skills
node $S/lookfy/scripts/check-count.cjs <문서.html> <N>                 # 시안 카드 수 = N, 번호 고유
node $S/htmlfy/scripts/verify.cjs <문서.html> [<같은폴더>/<slug>.png]    # 1280·390 콘솔 0·외부 요청 0·가로 넘침 0 + 휴대폰 스크린샷
node $S/lookfy/scripts/check-focus.cjs <문서.html>                      # 목업 안 글자 넘침 0, 포인트 버튼이 있으면 강조·Esc·재클릭·Enter
node $S/lookfy/scripts/test-mockup-picker.cjs <허브 URL 또는 문서.html>  # 선택·입력 후 600ms 지나도 클립보드 불변(자동 복사 없음), '복사' 클릭 시 프롬프트=클립보드, 단일/복수, 해제, 여러 줄, 전체 의견, 새로고침 유지, 패널 가림 없음(1280·390), 접기, 초기화, execCommand 폴백
```
- 클립보드 테스트는 보안 컨텍스트가 필요하다. 허브 URL이 있으면 그것을, 없으면 파일 경로를 주면 임시 로컬 http 서버(127.0.0.1, 빈 포트 자동)로 서빙하고 끝나면 닫는다.
- 스크린샷을 눈으로 확인한다(하단 패널이 카드 버튼·입력을 가리지 않는지, 겹침·잘림·대비, 다크모드).
- 이미지에 구워진 글자(png 렌더 시안)는 검사가 볼 수 없으므로 렌더 단계에서 넘침을 검사한다.

## 5. 커밋·띄우기·보고
htmlfy 4~6절을 그대로 따른다: 대상 저장소에 json·html·png(이미지 폴더)만 스테이징해 `[작업 ID] docs: <요약>` + 빈 줄 + Co-Authored-By 로 로컬 커밋 후 push는 htmlfy 4단계 규칙(작성자 환경: 묻지 않고 원격 브랜치로 push, SEC-AGENCY-RULES-0020, force 금지). 띄우기: 허브가 있으면 `node ~/.claude/skills/htmlfy/scripts/open.cjs --skill lookfy <저장소>/docs/design/<파일>.html`(허브 URL `<hubUrl>/f/<project-id>/docs/design/<파일>.html`, 작성자 환경은 크롬), 허브가 없으면 같은 명령이 file://로 연다(Chromium 계열은 file://도 '복사' 버튼 동작, 다른 브라우저이거나 복사가 안 되면 `--serve`를 붙여 백그라운드로 실행 — 임시 로컬 서버). 스크린샷은 파일 전송 도구가 있으면 보내고(예 SendUserFile) 없으면 경로. 보고(부모에게 `<agencyDir>/templates/agent-report.md` 또는 내장 양식): 요청 N·생성 N(check-count), 추천, 검증 수치(verify·check-focus·picker·넘침), 허브 URL, 스크린샷, 커밋 SHA·push 여부, 확인 못 한 것.

## 파일
- `assets/template.html` 골격 · `assets/focus-points.css/js` 포인트 강조 · `assets/mockup-picker.css/js` 선택·의견·하단 프롬프트 (부품 원본은 여기 한 곳. htmlfy는 참조만)
- `scripts/build.cjs` JSON→HTML(개수·번호·중복 검사) · `check-count.cjs` · `check-focus.cjs` · `test-mockup-picker.cjs` (verify.cjs는 htmlfy 원본 공유)
- `references/schema.md` · `example-5.json` · `example-30.json` · `make-examples.cjs`(예시 생성기, 가상 앱)
- `examples/example-5.html`·`example-30.html` 빌드 결과, `example-5-picker-mobile.png` 휴대폰 폭 확인 스크린샷
