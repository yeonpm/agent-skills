---
name: htmlfy
description: 요청 내용(조사 정리, 기획·스펙 정의서, 전후 비교, 보고서)을 단독 실행 HTML 문서로 만들어 대상 프로젝트 저장소 docs/에 저장·검증·로컬 커밋하고 로컬 문서 허브(설정 시) 또는 브라우저로 띄워 보여 준다. 사용자가 "htmlfy", "html 문서화", "html로 만들어줘/정리해줘/띄워줘/보여줘", "문서로 보기 좋게 만들어줘", "전후 비교 페이지" 등을 말하면 반드시 이 스킬을 쓴다. 예 - LiveKit 정리 문서, ficside 기사 전후 비교, 소곤 유료·무료 기능 스펙 정의서. 디자인 시안·목업 여러 개를 보여 달라는 요청("시안 N개", "시안 뽑아줘", "lookfy")은 lookfy 스킬이 맡는다. 단순 마크다운 답변, 운영 사이트 페이지 구현, 외부 공유용 게시만 요청한 경우는 제외.
---

# htmlfy — 요청 내용을 HTML 문서로 만들어 보여 주기

## 환경 (처음 한 번 확인)
- 경로·허브·열기 명령 등은 설정에서 읽는다(환경 변수 > `~/.config/agent-skills/config.json` > 기본값). 값·출처: `node <htmlfy>/scripts/config.cjs`(값 하나: `--get <키>`), 의존 점검: `node <htmlfy>/scripts/doctor.cjs`. `<htmlfy>`는 이 스킬 폴더(보통 `~/.claude/skills/htmlfy`). 키 설명은 저장소 README "설정".
- 설정 `nodeSetup`이 있으면 node 명령 전에 실행한다(예: nvm 전환). 없으면 PATH의 node(18+)를 쓴다.
- 운영 저장소(`agencyDir`)가 있으면 그 AGENTS.md·`templates/`·역할 파일·티켓 정책을 따른다. 없으면 `references/default-handoff.md` 내장 양식을 쓰고, 위임 구조가 없으면 에이전트가 직접 모든 단계를 수행한다.
- 설정 `excludePaths` 하위는 대상·참조로 쓰지 않는다.
- 이 문서의 `~/.claude/skills/<스킬>` 경로는 설치 위치를 뜻한다. 다른 곳(`install.sh --target`, Codex 등)에 설치했으면 그 경로로 바꿔 읽는다.
- 파일 이름·작성일의 날짜·시각 기본은 KST(Asia/Seoul)다. 사용자·프로젝트가 다른 시간대를 정했으면 그 시간대를 쓰고 문서에 표기한다.
- 보고 형식 기본은 "핵심 요약 → 상세 내용" 두 섹션(한국어)이다. 운영 저장소·사용자가 다른 형식을 정했으면 그것을 따른다.

## 0. 누가 쓰는가
- 운영 저장소에 위임 규칙이 있으면 따른다(작성자 환경: 접수 비서는 직접 작성하지 않고 해당 역할 — 조사=researcher, 스펙·기획=pm 등, 시안은 lookfy 스킬 — 하위 에이전트(Agent 도구)에 `<agencyDir>/templates/agent-handoff.md` 양식으로 위임). 양식이 없으면 `references/default-handoff.md`.
- 인계에 반드시: 작업 ID, 대상 저장소 경로, 그 저장소에서 읽을 문서(AGENTS.md/CLAUDE.md, 관련 docs·결정 기록), 사용자 결정 원문과 출처, 아래 1~6단계와 완료 조건, 보고 양식.
- 실행 에이전트(인계받은 쪽)가 아래 단계를 수행한다.

## 1. 대상 프로젝트와 저장 위치
- 등록부(설정 `projectsJson`)가 있으면 그 `path`로 저장소를 찾는다. 없으면 현재 git 저장소에 둔다. 프로젝트는 대화 맥락으로 판단하고 정말 모를 때만 (비서가 있으면 비서를 통해) 묻는다.
- 여러 프로젝트 공통 운영 문서만 운영 저장소(`agencyDir`)에 둔다. `excludePaths` 하위는 대상·참조로 쓰지 않는다.
- 작업 전 경로·브랜치·미커밋 변경을 확인하고 남의 변경은 건드리지 않는다.
- 파일: `docs/<종류>/YYYY-MM-DD-<slug>.html` (날짜는 KST)

| 종류 | 폴더 |
|---|---|
| 조사·기술 정리 | docs/research |
| 기획·스펙·정책 | docs/product |
| 디자인 시안(lookfy 스킬) | docs/design |
| 보고·전후 비교 | docs/reports |

  허브(설정 `hubUrl`)는 `docs/`·`knowledge/` 아래만 서빙하므로 그 밖에 두지 않는다(허브가 없어도 같은 위치를 쓴다).

## 2. 문서 규칙
- 한국어. 맨 위 **핵심 요약**(결과·결론, 사용자 할 일/결정 필요) → **상세 내용**.
- 단독 실행: CSS/JS 인라인, 외부 폰트·CDN·이미지 요청 없음. 이미지는 같은 폴더 상대 경로.
- `:root` 색 토큰 + `prefers-color-scheme: dark` 대응. `body` 배경 명시.
- 휴대폰 폭(390px)에서 가로 스크롤 없음: 넓은 표는 `overflow-x:auto` 래퍼 또는 카드로 전환, 긴 URL·코드는 `overflow-wrap:anywhere`.
- 컴팩트하고 읽기 쉬운 표/카드, 목차가 길면 상단 앵커 목록.
- 근거·출처 표기: 파일 경로, 결정 번호, URL, 조사일. 사실을 추정하지 않고 확인 못 한 것은 "미확인"으로 표시.
- 스펙·기획·결정 문서는 `[사용자 확인]`/`[제안]` 배지로 구분하고 범례를 둔다. 사용자 확인 근거(날짜·원문 출처)를 붙인다.
- 결정 필요 항목은 선택지 + 추천안(이유 한 줄).
- 모든 htmlfy 문서 head에 `assets/favicon.svg`를 인라인 data URI(`<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,...">`, URL 인코딩)로 넣는다(단독 실행 유지). 문서 자체에 다른 favicon이 필요한 시안 문서는 예외로 한다.
- 비밀값·토큰·개인정보를 넣지 않는다.
- 문서 하단에 작성일, 작업 ID, 원본 경로를 적는다.

## 2-1. 시안 문서 → lookfy 스킬
디자인 시안·목업을 보여 주는 문서는 **lookfy 스킬**(`~/.claude/skills/lookfy/SKILL.md`)을 따른다. 시안 규칙(개수 그대로·기본 30, 서로 다른 방향, 핵심 요약·비교표·현재안·시안 카드·봐야 할 포인트, 포인트 버튼은 필요한 경우만, 카드별 선택 버튼+의견 입력, 하단 프롬프트 실시간 작성·복사 버튼, 라운드 2 반영표·조합 분석, 넘침 0)과 부품(`lookfy/assets/focus-points.*`, `lookfy/assets/mockup-picker.*`)·검사 스크립트의 원본은 그 스킬 한 곳이며 여기에 복제하지 않는다. htmlfy 문서 안에 시안 비교가 일부 들어가는 경우에도 그 부분은 lookfy 규칙과 부품을 쓴다.

## 3. 검증
번들 스크립트로 데스크톱(1280)·휴대폰(390) 폭을 확인한다. 콘솔 오류 0, 외부 요청 0, 가로 넘침 0이어야 통과다. 휴대폰 폭 스크린샷 png 1장이 같은 폴더에 생긴다.
```bash
# (설정 nodeSetup이 있으면 먼저 실행)
# 최초 1회(네트워크): mkdir -p ~/.cache/agent-skills && cd ~/.cache/agent-skills && npm i playwright-core
#   브라우저는 Playwright 캐시 → 설치된 Chrome/Chromium/Edge 순으로 자동 선택(설정 browserExecutable로 지정 가능)
node ~/.claude/skills/htmlfy/scripts/verify.cjs <문서.html> [<같은폴더>/<slug>.png]
```
playwright가 없으면 verify는 설치 안내를 내고 exit 2로 끝난다. 이때 검증을 통과로 보고하지 않고 "미검증(playwright 없음)"으로 보고한다.
실패하면 고치고 다시 돌린다. 눈으로도 스크린샷을 한 번 확인한다(겹침·잘림·대비).

시안 문서는 lookfy 4절의 추가 검사(시안 수·목업 글자 넘침·포인트 버튼·선택 프롬프트 클립보드)도 돌린다.

## 4. 로컬 커밋
- 대상 저장소에 html + png(시안 문서는 이미지 폴더 포함)만 스테이징해 커밋한다. 메시지: `[<작업 ID>] docs: <요약>` + 빈 줄 + `Co-Authored-By:` 줄(저장소 관례가 다르면 관례). 운영 저장소에 티켓 정책(예 `<agencyDir>/docs/code-ticket-policy.md`)이 있으면 그 형식·발급 규칙을 따르고 발급된 ID가 없으면 커밋 보류하고 보고한다.
- push는 운영 저장소·대상 저장소 규칙을 따른다. 작성자 환경 규칙: 커밋한 뒤 묻지 않고 해당 저장소 흐름의 원격 브랜치로 push(사용자 지시 2026-11-26, SEC-AGENCY-RULES-0020), force push 금지, 스토어 업로드·운영 DB·외부 게시는 별도 승인, 배포 연동 저장소는 푸시 후 배포 SHA 확인. 규칙이 없으면 로컬 커밋까지만 하고 push는 사용자에게 확인한다.

## 5. 띄우기
- 띄우기: `node ~/.claude/skills/htmlfy/scripts/open.cjs <문서.html 또는 URL>`. 허브(`hubUrl`)가 설정돼 있고 응답하면 허브 URL(`<hubUrl>/f/<project-id>/<저장소 내 경로>`), 아니면 file://로 연다. '복사' 버튼 클립보드 복사가 필요한 문서(dcfy·lookfy)를 허브 없이 Chromium 계열이 아닌 브라우저로 열거나 복사가 안 되면 `--serve`(임시 로컬 서버 127.0.0.1, 보안 컨텍스트)를 백그라운드로 실행한다. 열기 명령은 설정 `openCommand`(기본 OS별 open / xdg-open / start).
- 허브가 설정돼 있는데 응답하지 않으면(open.cjs가 알림) 설정 `hubStartCommand`가 있을 때 그것을 백그라운드로 실행하고(포트가 사용 중이면 다음 포트로 뜨므로 시작 로그의 실제 주소 사용) 다시 연다. 없으면 file://로 연 사실을 보고한다.
- 작성자 환경: 사용자에게 보여 주는 문서는 사용자의 크롬으로 연다(`openCommand` = `open -a "Google Chrome"`). 페이지를 조작·점검해야 할 때만 ego lite(`ego-browser` 스킬)를 쓰고 크롬 확장(claude-in-chrome)·내장 브라우저 패널은 쓰지 않는다. 다른 환경에서는 가진 브라우저 도구를 쓴다.
- 파일 전송 도구(예 SendUserFile)가 있으면 스크린샷 png를 보낸다(없으면 경로만 보고).
- 다른 사람에게 공유하거나 외부 링크가 필요하다고 할 때만 Artifact로 게시한다(비공개 기본).

## 6. 보고 (핵심 요약 → 상세)
- 핵심 요약: 된 것 / 안 된 것 / 사용자 할 일·결정.
- 상세: 파일 경로, 허브 URL, 스크린샷 경로, 검증 결과(오류·넘침 수치), 커밋 저장소·짧은 SHA·push 여부, 확인 못 한 것.
- 하위 에이전트로 일하면 사용자에게 직접 보고하지 않고 부모에게 `<agencyDir>/templates/agent-report.md`(없으면 `references/default-handoff.md` 보고 양식)로 돌려준다.
