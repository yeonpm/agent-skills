---
name: task-token-report
description: 사용자가 작업별 토큰·시간 측정을 명시적으로 요청한 경우에만 요청 범위의 로컬 실행 로그(Claude Code 세션 jsonl, 이전 형식 Codex rollout)에서 실제 토큰과 경과 시간을 집계한다. 일반 작업 완료 보고에서는 자동 실행하지 않는다. API 청구액이나 계정 사용 한도 조회에는 사용하지 않는다.
---

# 작업별 토큰·시간 보고

사용자가 측정을 명시적으로 요청한 작업과 범위에서만 사용한다. 요청이 없으면 사용량 로그 조회, 측정용 manifest 생성, 파서 실행, 사용량 보고와 미계측 안내를 모두 생략한다. 과거 명시 요청 범위는 유지하되 다른 작업으로 확대하지 않는다.

`scripts/report.py`를 실행하고 짧은 JSON 결과만 읽는다. 로그 원문, 대화 본문, 도구 결과를 모델에 입력하거나 보고서에 복사하지 않는다. Python 표준 라이브러리만 필요하며 네트워크를 사용하지 않는다.

## 절차

1. 측정 요청 범위의 작업 시작 시 UTC 시작 시각, 티켓, 참여 세션 ID를 기록한다. 과거 요청을 포함하는 대화 전체를 현재 작업으로 간주하지 않는다.
2. 세션 로그를 찾는다(아래 '세션 찾기'). 찾지 못한 참여자는 누락으로 명시하고 `scope_complete: false`로 둔다. 모든 대화를 자동 수집하지 않는다.
3. manifest를 작업의 로컬 산출물 위치(또는 임시 폴더)에 만들고 `python3 <skill-directory>/scripts/report.py <manifest.json>`을 실행한다. 출력이 길면 `| head`로 잘라도 된다(파이프가 닫혀도 트레이스 없이 종료).
4. 완료 보고에 입력·캐시 읽기·캐시 쓰기·출력·추론 출력·총 토큰, 경과 시간, 포함 범위(본 세션/서브에이전트 포함 여부), 집계 시점, 누락(`issues`)과 참고(`notes`)를 쓴다.

## 세션 찾기 (Claude Code, 기본)

- 본 세션: `~/.claude/projects/<인코딩된 작업 경로>/<세션ID>.jsonl`. 인코딩은 작업 폴더 절대 경로의 `/` 등 구분 문자를 `-`로 바꾼 이름이다(예: `~/work/app` → `-Users-<사용자>-work-app`). `ls -t ~/.claude/projects/<인코딩>/*.jsonl | head`로 최근 세션을 좁힌다.
- 세션 ID는 현재 세션 정보(`claude --resume` 목록, 세션 파일명)로 확인한다. `log_path`를 생략하면 `<projects_dir>/*/<세션ID>.jsonl`(세션 항목의 `projects_dir`, 기본 `~/.claude/projects`)에서 하나만 찾아 쓴다(여러 개·없음이면 오류).
- 서브에이전트: `~/.claude/projects/<인코딩>/<세션ID>/subagents/agent-<agentId>.jsonl`(중첩 서브에이전트도 같은 폴더에 평평하게 저장). 본 세션 파일에는 서브에이전트 응답이 들어 있지 않으므로 별도로 합산한다.

```json
{
  "task_id": "OPS-EXAMPLE-0001",
  "started_at": "2026-11-27T01:00:00Z",
  "ended_at": null,
  "scope_complete": true,
  "sessions": [
    {"session_id": "<세션ID>",
     "log_path": "~/.claude/projects/<인코딩>/<세션ID>.jsonl",
     "include_subagents": true,
     "agent_ids": null,
     "from_uuid": null,
     "to_uuid": null}
  ]
}
```

- `format`: 생략 시 `session_id`가 있으면 `claude`, `thread_id`가 있으면 `codex`. 명시도 가능.
- 범위: `started_at`~`ended_at`(없으면 집계 시점)의 assistant 기록만 센다. 줄의 `sessionId`가 `session_id`와 다르면(복사·fork 기록) 제외한다(`foreign_skipped`).
- `from_uuid`/`to_uuid`(선택): 본 세션 파일에서 해당 `uuid` 줄부터 해당 줄까지(둘 다 포함, 파일 순서)만 센다. 보통 작업 요청 사용자 메시지의 uuid를 `from_uuid`로 쓴다. 찾지 못하면 `partial`. 서브에이전트 파일에는 적용하지 않고 시각 범위만 적용한다.
- `include_subagents`(기본 `true`, 반드시 bool): 그 세션의 서브에이전트 로그를 시각 범위 안에서 포함한다. 같은 시간대에 그 세션이 다른 작업의 서브에이전트도 돌렸다면 `agent_ids`(null 또는 비어 있지 않은 문자열 목록)로 좁히거나 `false`로 끈다. `agent_ids` 중 파일이 없는 것은 `issues`에 남는다. 타입이 틀리면 manifest 오류로 끝난다.
- 같은 `session_id`를 manifest에 두 번 넣으면 `duplicate session_id in manifest` 오류로 끝난다(범위는 한 항목의 `from_uuid`/`to_uuid`·`agent_ids`로 좁힌다).
- manifest 오류는 `Invalid manifest: <오류 종류>: <원인>`(예 `missing key 'sessions'`)을 stderr에 내고 exit 2로 끝난다.

## 집계 규칙 (Claude Code)

- 대상: `type: "assistant"` 줄의 `message.usage`. `message.model`이 `<synthetic>`(로컬 오류 메시지)인 줄은 제외한다(`synthetic_skipped`).
- 중복 제거: 한 응답은 content 블록마다 같은 `message.id`로 여러 줄 기록된다. 실측에서 같은 id 줄의 usage는 모두 같았다. 응답 키는 `message.id`, 없으면 `requestId`이며 모든 세션·파일에 걸쳐 한 번만 센다. 값이 다르면 마지막 줄 값을 쓰고 `duplicates_updated`로 표시한다(오류로 보지 않음).
- 필드 매핑: Claude의 `input_tokens`는 캐시를 제외한 입력이다. 보고 필드는 Codex와 같은 의미로 정규화한다.
  - `input_tokens` = `input_tokens` + `cache_read_input_tokens` + `cache_creation_input_tokens` (전체 입력)
  - `cached_input_tokens` = `cache_read_input_tokens`, `cache_write_input_tokens` = `cache_creation_input_tokens` (둘 다 입력의 부분집합)
  - 캐시 미사용 입력 = `input_tokens - cached_input_tokens - cache_write_input_tokens`
  - `output_tokens` = `output_tokens`, `reasoning_output_tokens` = `output_tokens_details.thinking_tokens`(출력의 부분집합). thinking이 출력보다 크거나 정수가 아닌 응답은 추론 0으로 두고 `notes`에 개수를, `output_tokens_details.thinking_tokens`가 없는 응답은 "추론 미기록(측정된 0 아님)"으로 `notes`에 개수를 남긴다. 두 개수는 응답 중복 제거 후(같은 `message.id`의 마지막 줄 기준) 세며 세션별 `thinking_unverified`·`reasoning_unrecorded`에도 나온다.
  - `total_tokens` = 전체 입력 + 출력
- 세션별 결과에 `main_usage`(본 세션)와 `subagent_usage`, 파일·응답 수가 나뉘어 나온다. 같은 응답이 여러 파일에 있으면 처음 본 파일에 귀속한다.

## 이전 형식: Codex rollout

세션 항목에 `thread_id`, `turn_ids`(비어 있지 않은 목록), `log_path`(`~/.codex/sessions` 아래 rollout jsonl; `rg --files ~/.codex/sessions`로 파일명만 좁힘)를 쓴다. `token_usage_record`의 `usage`만 응답 ID로 전역 중복 제거하며 누적값과 `token_count`를 더하지 않는다. 복사된 부모/fork 기록은 `payload.thread_id` 소유권으로 제외하고, 부모·자식의 서로 다른 응답은 각각 한 번 센다. 캐시 입력은 입력에, 추론 출력은 출력에 이미 포함된다. 오래된 로그에 `token_usage_record`가 없으면 0 사용으로 단정하거나 누적값으로 추정하지 않는다. 같은 manifest에 Claude·Codex 세션을 섞어 쓸 수 있다.

## 해석 주의

`ended_at`은 완료가 확인됐을 때만 설정한다. 생략/null이면 현재 집계 시점까지다. 경과 시간은 시작부터 종료/집계 시점까지 한 번 계산하며 병렬 세션 시간을 합산하지 않는다. 대기 시간도 포함하므로 CPU 시간·순수 작업 시간이라고 부르지 않는다. 시작 전에 진행 중이던 응답은 토큰을 시간 비례 배분하지 말고 범위 불확실성을 보고한다.

`recorded_snapshot`은 로그 관측치이며 청구서나 완전성 보증이 아니다. `partial`은 누락·형식 오류·범위 미확인이 있다는 뜻이므로 확정 총량이라고 보고하지 않는다. 실행 중 응답과 마지막 보고 응답은 아직 기록되지 않았을 수 있다. 집계 자체도 토큰을 쓰므로 재집계 루프를 만들지 않는다. cache_write는 관측 필드로 표시하며 요금 계산은 하지 않는다.

테스트: `python3 -m unittest discover -s <skill-directory>/tests`.

원본은 agent-skills 저장소(GitHub yeonpm/agent-skills)의 `task-token-report`이고, 설치 위치 `~/.claude/skills/task-token-report`는 `install.sh`가 건 심볼릭 링크다(2026-11-26, OPS-AGENCY-SKILLS_REPO-0001). 업데이트는 원본에서 하고 그 저장소에 커밋한다. 이 스킬은 Python 3 표준 라이브러리만 쓰며 agent-skills 설정 파일을 읽지 않는다(로그 위치는 manifest의 `log_path`·`projects_dir`로 바꾼다). 자동화·상시 감시·외부 쓰기 권한은 포함되지 않는다. 비서는 기존 작업/스킬 레코드에 원본 링크·Git SHA·검증 결과·집계 범위를 연결한다.
