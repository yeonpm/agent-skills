# agent-skills

여러 프로젝트에서 함께 쓰는 커스텀 에이전트 스킬(Claude Code / Codex `SKILL.md` 형식) 저장소다.
설정 없이 설치만 해도 동작한다. 경로 기반 연동(프로젝트 등록부, 운영 저장소, 로컬 문서 허브)은 설정하면 켜지는 선택 기능이다.

| 스킬 | 한 줄 설명 |
|---|---|
| `htmlfy` | 조사·스펙·전후 비교·보고서를 단독 실행 HTML 문서로 만들어 저장·검증하고 브라우저(또는 문서 허브)로 띄운다. 공용 스크립트(설정 해석·doctor·open)도 여기에 있다 |
| `dcfy` | 여러 프로젝트의 미결 결정을 설명·선택지·추천안이 있는 HTML 결정 문서로 모으고, 고른 답이 하단 프롬프트로 실시간 작성되고 '복사' 버튼으로 복사한다. 붙여 넣은 응답 프롬프트는 작업으로 처리하고, 확정 기록(읽기 전용)과 조치·결과를 같은 문서에 계속 갱신한다(생성 → 응답 → 처리·확정 기록·결과 갱신) |
| `lookfy` | 디자인 시안을 요청 개수 그대로(기본 30) 서로 다른 방향으로 만들어 카드별 선택·의견이 되는 HTML 시안 문서로 띄운다 |
| `brief` | 등록 프로젝트(없으면 현재 저장소)의 최근 3일 작업·다음 행동·결정을 브리핑한다 |
| `task-token-report` | 사용자가 요청한 경우에만 작업별 실제 토큰·경과 시간을 로컬 실행 로그(Claude Code 세션·서브에이전트 jsonl, 이전 형식 Codex rollout)에서 집계한다 |

문서와 주석은 한국어다(`brief`는 영어). 라이선스는 아직 정하지 않았다.

## 빠른 시작

```bash
git clone https://github.com/yeonpm/agent-skills.git ~/agent-skills
~/agent-skills/install.sh                      # ~/.claude/skills/<이름> 링크 + doctor 실행 (미리 보기: --dry-run)

# 검증 스크립트용 playwright-core (1회, 네트워크 필요). 브라우저는 설치된 Chrome/Chromium/Edge를 자동으로 쓴다.
mkdir -p ~/.cache/agent-skills && (cd ~/.cache/agent-skills && npm i playwright-core)

node ~/.claude/skills/htmlfy/scripts/doctor.cjs    # 의존·설정 점검
```

여기까지면 모든 스킬이 기본값으로 동작한다. 문서는 현재 git 저장소의 `docs/` 아래에 만들고 OS 기본 브라우저(file://)로 연다.

## 요구 사항

| 항목 | 필요한 스킬 | 필수 여부 |
|---|---|---|
| Node.js 18+ | htmlfy·dcfy·lookfy 스크립트 | 필수(빌드·검증). 특정 버전 관리자(nvm 등)는 필요 없다 |
| playwright-core + Chromium 계열 브라우저 | htmlfy `verify`, lookfy `check-focus`·`test-mockup-picker`, dcfy `test-clipboard` | 검증에만 필요. 없으면 그 명령만 안내 후 exit 2(빌드는 동작) |
| Python 3.8+ (표준 라이브러리) | task-token-report | 그 스킬에만 필요 |
| git | 저장 위치 판단(현재 저장소)·커밋 | 권장 |

dcfy·lookfy는 htmlfy의 공용 스크립트(`htmlfy/scripts/lib`)와 favicon·verify를 쓴다. htmlfy를 같은 스킬 폴더에 함께 설치한다(`install.sh`는 기본으로 전부 설치).

## 설치 (`install.sh`)

```bash
./install.sh [--target DIR]... [--codex] [--only a,b] [--copy] [--dry-run] [--no-doctor]
```

- 기본 대상은 `~/.claude/skills`(또는 `$CLAUDE_SKILLS_DIR`). `--target`으로 다른 폴더(여러 개 가능)에 설치한다.
- 여러 번 실행해도 결과가 같다. 이미 맞는 링크는 그대로 두고, 다른 곳을 가리키는 링크는 다시 걸고, 링크가 아닌 실제 폴더는 대상 옆 `<대상>-install-backup/<시각>/`(기본 `~/.claude/skills-install-backup/<시각>/`)으로 옮긴 뒤 링크한다.
- `~/.codex/skills`(또는 `$CODEX_SKILLS_DIR`): `--target` 없이 실행하면 같은 이름이 이미 있을 때만 다시 연결한다. `--target`을 주면 건드리지 않는다. `--codex`면 항상 설치한다.
- `--only`로 일부만 설치하면 doctor는 나머지를 정보(info)로 표시한다. dcfy·lookfy에는 htmlfy가 함께 있어야 한다.
- `--copy`: 심볼릭 링크를 따라가지 않는 도구용 복사 설치(다시 실행하면 갱신, 자기 복사본은 백업 없이 교체).
- 끝나면 `doctor --no-launch`를 실행한다(`--no-doctor`로 생략).

## 설정

스크립트는 공용 모듈 `htmlfy/scripts/lib/skills-env.cjs` 하나로 설정을 해석한다. **우선순위: 환경 변수 > 설정 파일 > 기본값.**

- 설정 파일: `$AGENT_SKILLS_CONFIG` 또는 `${XDG_CONFIG_HOME:-~/.config}/agent-skills/config.json`. 없어도 된다. 값의 앞 `~`는 홈 폴더로 바뀐다.
- 환경 변수를 빈 문자열로 주면 그 값을 "없음"으로 덮어쓴다(예 `AGENT_SKILLS_HUB_URL=` → 허브 끔).
- 해석 결과 보기: `node ~/.claude/skills/htmlfy/scripts/config.cjs` (값 하나 `--get <키>`, 키 목록 `--keys`, 스킬별 `--skill dcfy`).

| 키 | 환경 변수(앞이 우선) | 기본값 | 용도 |
|---|---|---|---|
| `projectsJson` | `AGENT_SKILLS_PROJECTS_JSON`, `AGENCY_PROJECTS_JSON` | 없음 → 현재 git 저장소 하나(id = 폴더 이름) | 프로젝트 등록부 `{ "projects": [{ "id", "path" }] }` 또는 배열. 허브 URL·저장 위치·brief 범위 |
| `agencyDir` | `AGENT_SKILLS_AGENCY_DIR` | `projectsJson`이 `<dir>/config/projects.json`이면 `<dir>`, 아니면 없음 | 운영 저장소: `AGENTS.md`, `templates/agent-handoff.md`·`agent-report.md`, 역할 파일, 티켓 정책. 없으면 `htmlfy/references/default-handoff.md` 내장 양식 |
| `hubUrl` | dcfy `DECISION_DOC_HUB` · lookfy `LOOKFY_HUB`, 공용 `AGENT_SKILLS_HUB_URL` | 없음 | 로컬 문서 허브 주소. 문서 URL `<hubUrl>/f/<project-id>/<저장소 내 경로>`(docs/·knowledge/·루트 STATUS.md·README.md만) |
| `hubStartCommand` | `AGENT_SKILLS_HUB_START_COMMAND` | 없음 | 허브가 꺼져 있을 때 안내·실행할 명령 |
| `openCommand` | `AGENT_SKILLS_OPEN_COMMAND` | macOS `open`, Linux `xdg-open`, Windows `cmd /c start ""` | 사용자에게 문서를 띄우는 명령(뒤에 URL이 붙음) |
| `playwrightModule` | `AGENT_SKILLS_PLAYWRIGHT_MODULE` | 차례로 `~/.cache/agent-skills/node_modules/playwright-core`, `~/.cache/htmlfy-verify/…`(옛 위치), Node 모듈 검색(`playwright-core`·`playwright`), 전역 npm | 검증용 Playwright |
| `browserExecutable` | `AGENT_SKILLS_BROWSER_EXECUTABLE` | Playwright 기본 → Playwright 캐시(`PLAYWRIGHT_BROWSERS_PATH`, OS별 `ms-playwright`) → 설치된 Chrome·Chromium·Edge·Brave | 검증용 브라우저 실행 파일 |
| `taskIdPattern` | `AGENT_SKILLS_TASK_ID_PATTERN` | `^[A-Za-z0-9][A-Za-z0-9._-]*$` | dcfy·lookfy 문서 `meta.taskId` 형식 |
| `decisionsDir` | `AGENT_SKILLS_DECISIONS_DIR` | `<agencyDir>/docs/reports/decisions`, 없으면 `<현재 저장소>/docs/reports/decisions` | dcfy 여러 프로젝트 결정 문서 위치 |
| `excludePaths` | `AGENT_SKILLS_EXCLUDE_PATHS`(`:` 구분) | 없음 | 수집·참조에서 뺄 경로 |
| `nodeSetup` | `AGENT_SKILLS_NODE_SETUP` | 없음 | node 명령 전에 실행할 셸 준비(예 nvm). SKILL.md 절차가 참고한다 |

### 선택 연동 예시: 작성자 환경 (ai-agency 운영 저장소 + 로컬 문서 허브)

작성자는 운영 저장소(`~/yeonpm/ai-agency`, 프로젝트 등록부·역할·인계 양식·티켓 정책)와 로컬 문서 허브(`~/yeonpm/docs-hub`, `http://127.0.0.1:8080`)를 쓴다. 아래 설정이면 이전과 똑같이 동작한다(허브 URL, 크롬으로 열기, `DEPT-PROJECT-WORK-NNNN` 작업 ID 검사).

```json
{
  "projectsJson": "~/yeonpm/ai-agency/config/projects.json",
  "agencyDir": "~/yeonpm/ai-agency",
  "hubUrl": "http://127.0.0.1:8080",
  "hubStartCommand": "cd ~/yeonpm/docs-hub && source ~/.nvm/nvm.sh && nvm use 24 && npm start",
  "openCommand": "open -a \"Google Chrome\"",
  "playwrightModule": "~/.cache/htmlfy-verify/node_modules/playwright-core",
  "taskIdPattern": "^[A-Z][A-Z0-9_]*-[A-Z][A-Z0-9_]*-[A-Z][A-Z0-9_]*-[0-9]{4,}$",
  "decisionsDir": "~/yeonpm/ai-agency/docs/reports/decisions",
  "excludePaths": ["~/yeonpm/deprecated"],
  "nodeSetup": "source ~/.nvm/nvm.sh >/dev/null && nvm use 24 >/dev/null"
}
```

- 허브는 `GET /f/<project-id>/<경로>`로 등록 프로젝트의 파일을 서빙하는 아무 로컬 서버면 된다. 없으면 file://(Chromium 계열은 file://도 보안 컨텍스트라 dcfy의 '복사' 버튼과 lookfy의 자동 복사가 동작) 또는 `open.cjs --serve`(임시 `127.0.0.1` 서버)로 연다.
- 운영 저장소가 있으면 SKILL.md의 위임·보고·티켓·push 규칙은 그 저장소 규칙을 따른다. 없으면 에이전트 혼자 모든 단계를 수행하고, push는 사용자에게 확인한다.

## 공용 명령 (htmlfy/scripts)

| 명령 | 하는 일 |
|---|---|
| `doctor.cjs [--json] [--no-launch]` | Node·Python 버전, 설정 파일·해석 결과(값·출처), 등록부, 운영 저장소 양식, 허브 응답, 열기 명령, playwright·브라우저(실제 실행), 스킬 설치 링크 점검 |
| `config.cjs [--get 키] [--keys] [--skill 이름]` | 설정 해석 결과 출력 |
| `open.cjs <파일\|URL> [--serve] [--print]` | 허브가 응답하면 허브 URL, 아니면 file://로 연다. `--serve`는 임시 로컬 서버로 서빙(백그라운드로 실행) |
| `verify.cjs <문서.html> [shot.png]` | 1280·390 폭 콘솔 오류 0·외부 요청 0·가로 넘침 0 + 휴대폰 스크린샷 |

- 설정 파일이 깨졌거나, 알 수 없는 키가 있거나, `taskIdPattern` 정규식이 틀리면 빌드·검증·열기 스크립트가 stderr에 `[agent-skills 설정 경고]`를 내고 기본값으로 계속한다.
- 임시 로컬 서버(`--serve`, 클립보드·picker 테스트)는 `127.0.0.1`에만 열린다. 그 문서 폴더 밖 경로와 폴더 밖을 가리키는 링크는 404, 잘못된 인코딩은 400, Host가 127.0.0.1·localhost가 아니면 403으로 거부한다. 문서 폴더 안의 이미지 등이 폴더 밖을 가리키는 심볼릭 링크면 `--serve`에서 404로 깨지므로 실제 파일로 둔다(허브·file://는 영향 없음).
- playwright 자동 탐색은 현재 작업 폴더의 `node_modules`도 `require`하므로 그 저장소에 설치된 패키지 코드가 실행된다(신뢰 범위는 그 저장소에서 `npm test`를 돌리는 것과 같다). 신뢰하지 않는 저장소에서는 설정 `playwrightModule`(또는 `AGENT_SKILLS_PLAYWRIGHT_MODULE`)로 위치를 고정한다.
- Windows(`cmd /c start`)에서는 URL의 `& | < > ^ "`를 file:// URL이면 퍼센트 인코딩, 그 밖이면 `^`로 이스케이프해서 넘긴다. `^` 이스케이프는 cmd 한 단계 해석만 가정하므로 쿼리에 메타문자가 많은 http URL은 실제 Windows에서 확인되지 않았다(허브 URL은 쿼리가 없어 해당 없음).

dcfy `test-clipboard.cjs`와 lookfy `test-mockup-picker.cjs`는 허브 URL 또는 파일 경로를 받는다. 파일이면 임시 로컬 서버로 시험하고 닫는다.

## 스킬별 의존 조사

"없으면"은 설정·환경 없이 설치만 한 상태다.

| 스킬 | 의존 | 없으면 증상(이전) | 지금 대체 동작 |
|---|---|---|---|
| 공통(htmlfy·dcfy·lookfy) | `~/.cache/htmlfy-verify`의 playwright-core | 검증 스크립트가 모듈 없음으로 종료 | 여러 위치·Node 모듈 검색 → 없으면 설치 안내와 exit 2(빌드는 동작), doctor가 경고 |
| 공통 | macOS `~/Library/Caches/ms-playwright` 브라우저 | 다른 OS·새 계정에서 브라우저 실행 실패 | OS별 Playwright 캐시 → 설치된 Chrome·Chromium·Edge·Brave, `browserExecutable` |
| 공통 | nvm + Node 24(`source ~/.nvm/nvm.sh`) | nvm 없는 셸에서 절차 명령 실패 | PATH의 Node 18+, 필요하면 `nodeSetup` |
| 공통 | `open -a "Google Chrome"`(macOS·크롬) | 다른 OS·브라우저에서 열기 실패 | `open.cjs`: OS별 open / xdg-open / start, `openCommand` |
| htmlfy | `~/yeonpm/ai-agency/config/projects.json` | 저장 위치를 찾는 절차가 깨짐 | 현재 git 저장소 `docs/` |
| htmlfy·dcfy·lookfy | 허브 `127.0.0.1:8080`·`~/yeonpm/docs-hub` | 허브 링크가 죽은 주소, 허브 시작 명령 실패 | 허브 미설정 → 허브 링크 생략, file:// 또는 임시 로컬 서버 |
| htmlfy·dcfy·lookfy | ai-agency `templates/agent-handoff.md`·`agent-report.md`, 역할 파일(`agents/*.md`), 티켓 정책 | 인계·보고 양식 없음 | `htmlfy/references/default-handoff.md`, 위임 구조 없으면 직접 수행 |
| htmlfy·dcfy·lookfy | "묻지 않고 push" 작성자 규칙 | 남의 저장소에 바로 push | 운영 저장소 규칙이 있을 때만, 없으면 로컬 커밋 후 push 확인 |
| dcfy·lookfy 빌드 | 등록부(`AGENCY_PROJECTS_JSON`), 허브(`DECISION_DOC_HUB`·`LOOKFY_HUB`) | 등록부 없으면 링크 생략(동작은 함), 허브 기본값이 8080 | 같은 환경 변수 호환 + 설정 파일, 기본은 허브 없음·현재 저장소 |
| dcfy·lookfy 빌드 | `DEPT-PROJECT-WORK-NNNN` 작업 ID 강제 | 다른 ID면 빌드 실패 | `taskIdPattern`(기본: 영문·숫자·`._-` 아무 ID) |
| dcfy | `~/yeonpm/ai-agency/docs/reports/decisions` 저장·응답 기록 위치 | 그 폴더가 없음 | `decisionsDir`(기본 운영 저장소 또는 현재 저장소 `docs/reports/decisions`) |
| dcfy | `test-clipboard.cjs`가 허브 URL만 받음 | 허브 없으면 클립보드 검사 불가 | 파일 경로 → 임시 로컬 서버 |
| dcfy·htmlfy·lookfy | `~/yeonpm/deprecated` 제외 규칙 | 해당 없음(개인 경로 언급) | `excludePaths` |
| lookfy | htmlfy 스킬(favicon·verify·공용 모듈) | htmlfy 없으면 favicon 경고·검증 불가 | 같은 폴더 설치 전제, 없으면 명확한 오류(exit 2) |
| brief | `~/yeonpm/ai-agency`·`config/projects.json`, Notion 기록 규칙(`config/notion.json`) | 등록부를 못 찾음, Notion 절차가 다른 환경에 없음 | 설정 `projectsJson`, 없으면 현재 저장소만(범위에 표시). 외부 기록은 정책이 허용할 때만 |
| task-token-report | `~/.claude/projects` 로그(Claude Code 표준 위치), Python 3 | 해당 없음 | manifest `log_path`·`projects_dir`로 변경 |
| htmlfy·dcfy·lookfy·brief | 날짜·시각 KST(Asia/Seoul) 기본 | 다른 시간대 사용자는 파일 이름 날짜가 하루 어긋날 수 있음 | 기본은 KST 그대로. 사용자·프로젝트가 정한 시간대가 우선(문서에 표기). brief는 사용자 지정 시간대 우선 |
| htmlfy·dcfy·lookfy | SKILL.md 명령의 고정 경로 `~/.claude/skills/<스킬>` | 다른 곳에 설치하면 명령 경로가 틀림 | 그 경로는 설치 위치를 뜻하며, 다른 설치 위치면 바꿔 읽는다(htmlfy "환경" 절). 스크립트는 자기 위치(`__dirname`) 기준이라 영향 없음 |
| htmlfy·dcfy·lookfy·brief | 보고 형식 "핵심 요약 → 상세 내용"(한국어, 작성자 규칙) | 다른 팀 형식과 다름 | 기본 형식으로 두고, 운영 저장소·사용자가 정한 형식이 우선 |

## 수정 규칙

- 스킬을 고치면 이 저장소에서 커밋한다. 작성자 환경에서는 바로 `git push`한다(사용자 지시 2026-11-26).
- 스크립트는 `~/.claude/skills/<이름>/...` 경로로 호출해도 링크를 따라 이 저장소 파일이 실행된다. 스크립트 안에서 자기 위치가 필요하면 `__dirname`/`Path(__file__).resolve()`를 쓴다. 다른 스킬 파일은 형제 폴더 상대 경로(`<스킬>/../htmlfy/...`)로 찾는다.
- 개인 경로·사용자 이름·비밀값·토큰·외부인 이메일을 넣지 않는다(예시는 `~` 표기). `.bak` 파일은 커밋하지 않는다(.gitignore).
- 설정 키를 더하면 `skills-env.cjs`의 `KEYS`와 이 README "설정" 표를 함께 고친다.
- 테스트: `node htmlfy/tests/test-skills-env.cjs`(공용 모듈: 임시 서버 안전 장치·cmd 이스케이프·설정 우선순위·경고), `python3 -m unittest discover -s task-token-report/tests`, 빌드·검증은 각 SKILL.md 검증 절.
- `lm`·`lp`·`lpm`·`pm`은 [agent-skills-feature](https://github.com/yeonpm/agent-skills-feature)의 `etc/`로 옮겼다(2026-11-27). 특정 프로젝트·기능 전용 스킬은 그 저장소에 둔다.
