---
name: task-token-report
description: 사용자가 작업별 토큰·시간 측정을 명시적으로 요청한 경우에만 요청 범위의 로컬 실행 로그에서 실제 토큰과 경과 시간을 집계한다. 일반 작업 완료 보고에서는 자동 실행하지 않는다. API 청구액이나 계정 사용 한도 조회에는 사용하지 않는다.
---

# 작업별 토큰·시간 보고

사용자가 측정을 명시적으로 요청한 작업과 범위에서만 사용한다. 요청이 없으면 사용량 로그 조회, 측정용 manifest 생성, 파서 실행, 사용량 보고와 미계측 안내를 모두 생략한다. 과거 명시 요청 범위는 유지하되 다른 작업으로 확대하지 않는다.

`scripts/report.py`를 실행하고 짧은 JSON 결과만 읽는다. 전체 rollout, 대화 본문, 도구 결과를 모델에 입력하거나 보고서에 복사하지 않는다. Python 표준 라이브러리만 필요하며 네트워크를 사용하지 않는다.

1. 측정 요청 범위의 작업 시작 시 UTC 시작 시각, 티켓, 실제 참여 thread와 turn ID를 기록한다. 비서·실행자·내부 서브에이전트 범위를 인계와 함께 유지한다. 과거 요청을 포함하는 대화 전체를 현재 작업으로 간주하지 않는다.
2. 아래 manifest를 작업의 로컬 산출물 위치에 만든다. `rg --files ~/.codex/sessions`로 해당 thread 파일명만 좁힌다. 실제 ID는 도구의 세션 정보 또는 로그의 식별 메타데이터로 확인한다. 찾지 못한 참여자는 누락으로 명시하고 `scope_complete: false`로 둔다. 모든 대화를 자동 수집하지 않는다.
3. `python3 <skill-directory>/scripts/report.py <manifest.json>` 실행. `usage`만 응답 ID로 전역 중복 제거하며 누적값과 `token_count`를 더하지 않는다. 복사된 부모/fork 기록은 명시된 thread 소유권과 응답 ID로 제외한다. 부모 자식의 서로 다른 응답은 각각 한 번 계산한다.
4. 완료 보고에 입력·캐시 입력·출력·추론 출력·총 토큰, 경과 시간, 포함 범위, 집계 시점, 누락을 쓴다. 캐시 입력은 입력에, 추론 출력은 출력에 이미 포함된다. cache_write는 관측 필드로만 표시하고 추가 요금 계산에 사용하지 않는다.

```json
{
  "task_id": "SEC-AGENCY-RULES-0007",
  "started_at": "2026-10-07T04:50:00Z",
  "ended_at": null,
  "scope_complete": false,
  "sessions": [
    {"thread_id": "actual-thread-id", "turn_ids": ["actual-turn-id"], "log_path": "/absolute/path/to/rollout.jsonl"}
  ]
}
```

`ended_at`은 완료가 확인됐을 때만 설정한다. 생략/null이면 현재 집계 시점까지 경과 시간이다. 시간은 작업 시작부터 종료/집계 시점까지 한 번 계산하여 병렬 시간을 중복 합산하지 않는다. 대기 시간도 포함하며 CPU 시간이나 순수 작업 시간이라고 부르지 않는다. 시작 전에 진행 중이던 응답은 토큰을 시간 비례 배분하지 말고 범위 불확실성을 보고한다.

`recorded_snapshot`은 로그 관측치이며 최종 청구/완전성 보증이 아니다. `partial`은 누락·형식 오류·응답 충돌이 있으므로 확정 총량이라고 보고하지 않는다. 실행 중 응답과 마지막 보고 응답은 아직 기록되지 않을 수 있다. 집계 자체도 토큰을 쓰므로 재집계 루프를 만들지 않는다. 오래된 로그에 `token_usage_record`가 없으면 0 사용으로 단정하거나 누적값으로 임의 추정하지 않는다.

원본은 `~/yeonpm/agent-skills/agent-skills-common/task-token-report`(GitHub yeonpm/agent-skills-common)이고, 사용자 설치 위치 `~/.claude/skills/task-token-report`는 그 심볼릭 링크다(2026-11-26, OPS-AGENCY-SKILLS_REPO-0001). 업데이트는 원본에서 하고 그 저장소에 커밋·push한다. 자동화·상시 감시·Notion 쓰기 권한은 포함되지 않는다. 비서는 기존 작업/스킬 레코드에 원본 링크·Git SHA·검증 결과·집계 범위를 연결한다.
