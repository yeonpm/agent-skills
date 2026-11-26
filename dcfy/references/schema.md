# decisions.json 스키마

`scripts/build.cjs`가 이 형식을 점검한다. 예시: `example-decisions.json`. 실제 사용 예: `ai-agency/docs/reports/decisions/2026-11-17-1130-decisions.json`(선택지 설명 포함).

## 최상위
| 키 | 필수 | 설명 |
|---|---|---|
| `meta` | 예 | 문서 정보(아래) |
| `projects` | 아니오 | `{ "<project-id>": { "name": "표시 이름" } }`. 없으면 id를 그대로 표시 |
| `decisions` | 예 | 결정 항목 배열(문서·프롬프트 순서 = 배열 순서, 프로젝트별로 묶여 표시) |
| `todos` | 아니오 | 결정이 아닌 사용자 할 일 배열 |

## meta
| 키 | 필수 | 설명 |
|---|---|---|
| `title` | 예 | 문서 제목(탭 제목) |
| `date` | 예 | `YYYY-MM-DD`(KST). 프롬프트 첫 줄 `결정 문서 <date> 응답` |
| `taskId` | 예 | `DEPT-PROJECT-WORK-NNNN` 형식 |
| `createdAt` | 아니오 | 표시용 작성 시각 예 `2026-11-17 11:10 KST` |
| `summary` | 아니오 | 핵심 요약에 붙일 한두 문장(가장 급한 것) |
| `footerNote` | 아니오 | 하단 메모(원천 목록 등) |
| `docPath` | 아니오 | 프롬프트 둘째 줄의 문서 경로. 생략 시 build가 출력 절대경로로 채움 |
| `storageKey` | 아니오 | localStorage 키. 생략 시 docPath |

## decisions[]
| 키 | 필수 | 설명 |
|---|---|---|
| `id` | 예 | 문서 안에서 유일. 대문자·하이픈 권장 예 `SOGON-POL001-Q1` |
| `project` | 예 | `config/projects.json` id(등록 안 된 대상은 임의 id + `projects`에 이름) |
| `title` | 예 | 한 줄 제목(프롬프트에 그대로 들어감) |
| `type` | 아니오 | `single`(기본, 라디오) · `multi`(체크박스) · `text`(피드백 입력) |
| `urgency` | 아니오 | `high`(긴급) · `normal`(기본) · `low` |
| `group` | 아니오 | 프로젝트 안 소제목(같은 값이 연속되면 한 번만 표시) |
| `background` | 권장 | 왜 필요한지 |
| `blocks` | 권장 | 이 결정이 막고 있는 작업 |
| `note` | 아니오 | 참고(원본 확인 필요, 원본에 추천 없음, 가정 구현 여부 등) |
| `question` | 아니오 | 질문 문장 |
| `options[]` | single·multi 필수 | `{ key, label, desc?, pros?, cons?, considerations?, recommended? }`. key는 항목 안에서 유일, `__`로 시작 금지. label은 프롬프트에 그대로 들어가므로 선택지 번호·기호를 포함해 명확하게. 설명 필드는 아래 표 |
| `recommendReason` | 추천이 있으면 필수 | 추천 이유 한 줄. single은 추천 1개까지 |
| `allowCustom` | 아니오 | 기본 true — '직접 입력' 선택지 추가 |
| `allowHold` | 아니오 | 기본 true — '보류' 선택지 추가 |
| `fields[]` | text 필수 | `{ key, label, hint? }` 문항별 입력칸 |
| `sources[]` | 예(1개 이상) | `{ label, path?, url? }`. path가 등록 프로젝트의 docs/·knowledge/·STATUS.md·README.md면 허브 url 자동. 대화 근거는 `{ "label": "현재 비서 대화(날짜) — 저장소 기록 없음" }` |
| `resolution` | 아니오 | 사용자가 답한 뒤 채우는 확정 기록(아래). 있으면 읽기 전용 확정 카드가 되고 프롬프트·추천안 일괄·초기화·저장에서 빠진다 |

모든 항목에 메모 칸이 자동으로 붙는다(확정 카드 제외).

### decisions[].resolution (선택, 2026-11-20 추가)
SKILL.md 7단계에서 처리 에이전트가 채운다. 사용자 원문 그대로, 추정 금지, 검증 안 한 것은 "미검증".

| 키 | 필수 | 형식 | 설명 |
|---|---|---|---|
| `status` | 예 | `decided`·`deferred`·`in_progress`·`done`·`blocked` | 표시: 조치 대기·보류(다음 문서로 이월)·진행 중·완료·차단 |
| `user_answer` | 예 | 문자열 | 사용자가 붙여 넣은 그 항목의 프롬프트 줄 원문(선택·메모 포함, 수정 금지). `→` 뒤가 "확정한 답"으로 표시된다 |
| `decided_at` | 아니오 | 문자열 | KST 예 `2026-11-20 14:10 KST` |
| `response_doc` | 아니오 | 절대 경로 | `<문서>-response.md`. 허브 서빙 경로면 링크 |
| `instruction` | 아니오 | 문자열 | 사용자 지시 요약 한 줄(원문과 다르게 해석 금지) |
| `actions[]` | 아니오 | `{ date, what, who?, evidence? }` | 날짜별 조치. `evidence`는 문자열 또는 `{label, path?, url?}`(배열 가능): http(s) → 링크, 등록 프로젝트 docs/·knowledge/·STATUS.md·README.md 절대 경로 → 허브 링크, 커밋 SHA·작업 ID·기타 → 텍스트 |
| `result` | 아니오 | 문자열 | 최종 결과 한 줄과 상태 |
| `remaining` | 아니오 | 문자열 또는 배열 | 남은 일. 없으면 비우거나 생략 |

- 다음 결정 문서에는 resolution이 있는 ID를 올리지 않는다(`deferred`·`blocked`는 최신 상태 확인 후 다시 올림).
- 핵심 요약은 확정 항목이 있으면 "확정 n건(완료·진행[·차단·보류]) · 미결 n건 · 긴급(미결) n건"으로 바뀐다. 없으면 기존과 같다.
- 빌드 출력 JSON에 `resolved`·`resolvedByStatus`가 붙는다.

### options[]의 설명 필드 (선택, 2026-11-17 추가)
| 키 | 형식 | 표시 | 설명 |
|---|---|---|---|
| `desc` | 문자열 | 라벨 아래 회색 글 | 선택지가 실제로 무엇을 하는지(기존 유지) |
| `pros` | 문자열 또는 문자열 배열 | `+` 초록 | 장점 |
| `cons` | 문자열 또는 문자열 배열 | `−` 빨강 | 단점·위험 |
| `considerations` | 문자열 또는 문자열 배열 | `?` 노랑 | 생각해 볼 점·고려할 부분(선행 조건, 되돌리기, 다른 결정과의 연결 등) |

- 각 1~3줄, 한 줄은 짧게. build가 배열로 정규화하고 빈 값은 버린다. 문자열·배열 외 형식은 빌드 실패.
- 근거를 줄 끝 괄호로 적는다 예 `(S-2)`, `(§5-3)`, `(STATUS §2)`. 원본에 없는 일반 고려사항은 줄 앞에 `(비서 정리)`를 붙인다. 추정은 `추정`이라고 쓴다.
- 경고(빌드는 계속): 선택지 2개 이상인 single·multi 결정에서 추천안에 세 필드가 모두 없으면 `build 경고`를 stderr에 출력하고 출력 JSON `warnings`에 개수를 적는다.
- 프롬프트에는 들어가지 않는다(선택 라벨만).

## todos[]
`{ project, title, detail?, url?, path? }` — 문서 상단 "사용자 할 일"에만 표시, 프롬프트에는 들어가지 않는다.

### todos[] 상세 필드 (선택, 2026-11-18 추가)
아래 필드 중 하나라도 있으면 그 할 일은 번호 붙은 **펼침 카드**로 표시된다(접힌 줄에 제목·프로젝트·`what`·`eta` 첫 문장 → 펼치면 나머지 상세. `what`은 접힌 줄에만 표시). 하나도 없으면 기존처럼 한 줄 목록으로 표시된다(하위 호환).

| 키 | 형식 | 표시 이름 | 내용 |
|---|---|---|---|
| `what` | 문자열 | 무엇을 | 한 줄 |
| `why` | 문자열 | 왜 필요한지 | 이 일이 무엇을 막고 있는지 |
| `where` | 문자열 또는 `{label, url?, path?}`의 배열 | 어디서 | 사이트·앱·화면·메뉴 경로·파일 경로. URL은 원본에 있는 것만. `path`가 허브 서빙 경로면 url 자동 |
| `steps` | 문자열 배열 | 단계별 방법 | 1, 2, 3… 순서 |
| `done` | 문자열 | 완료 기준 | 무엇이 보이면 끝인지 |
| `eta` | 문자열 | 예상 소요 | 근거가 없으면 "추정" 표기 |
| `report` | 문자열 | 비서에게 회신 | 끝나면 대화창에 적을 문구 |
| `caution` | 문자열 또는 배열 | 주의 | 비밀값 금지 등 |
| `note` | 문자열 | 참고 | "원본 확인 필요" 등 |
| `sources` | `[{label, path?, url?}]` | 근거·원본 | 없으면 `url`/`path`를 근거로 표시 |

- 원본에 없는 내용은 지어내지 않는다. 일반적 안내는 줄 앞에 `(비서 정리)`, 확인 안 된 것은 `원본 확인 필요`, 추정은 `추정`.
- 할 일은 프롬프트에 들어가지 않는다(`report` 문구는 사용자가 직접 대화창에 적는다).

## 프롬프트 출력 예
```
결정 문서 2026-11-17 응답
문서: /Users/.../docs/reports/decisions/2026-11-17-1110-decisions.html (작업 OPS-AGENCY-DECISION_DOC_SKILL-0001)
[SOGON-MIGRATION] 소곤·원격 Supabase 마이그레이션 4개 적용 방법 → 선택: (1) Claude 도구 apply_migration 허용 후 "재개" (추천안)
[MOAI-FUN] 모아이 워크·병맛(웃음) 요소 방향 → 선택: 머리 위 짐 쌓기 (추천안), 구경꾼 / 메모: 실패할 때 웃기게
[MOAI-PLAYTEST] 모아이 워크·플레이테스트 피드백 → 피드백: Q2 카메라 A/B: "B가 더 잘 보임"
미결 2건: HUB-MOBILE, SOGON-COMPACT-DOC
위 응답대로 각 원본 문서에 기록하고 담당 작업에 위임해 줘. 보류·미결은 다음 결정 문서에 다시 올려 줘.
```
