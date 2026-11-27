# agent-skills

여러 프로젝트에서 함께 쓰는 커스텀 에이전트 스킬(Claude Code / Codex `SKILL.md` 형식)의 원본 저장소다.
`~/.claude/skills/<이름>`은 이 저장소 폴더를 가리키는 심볼릭 링크다.

> **공개 저장소 안내**
> - 이 스킬들은 작성자 개인 작업 환경을 전제로 만들었다. 그대로 쓰면 일부가 동작하지 않는다.
>   - 에이전트 운영 저장소 `~/yeonpm/ai-agency`와 그 `config/projects.json`(프로젝트 등록부). 경로는 `AGENCY_PROJECTS_JSON` 환경 변수로 바꿀 수 있다(dcfy·lookfy 빌드 스크립트).
>   - 로컬 문서 허브 `http://127.0.0.1:8080`(`~/yeonpm/docs-hub`). 주소는 `DECISION_DOC_HUB`(dcfy)·`LOOKFY_HUB`(lookfy)로 바꿀 수 있다.
>   - preview → main 브랜치 운영, 작업 ID(부서-프로젝트-작업-번호) 규칙 등 작성자 프로젝트 규칙(`brief`).
> - 다른 환경에서는 참고용 예시로 보고, 경로·규칙을 자기 환경에 맞게 고쳐 쓴다.
> - 문서와 주석은 한국어다. 라이선스는 아직 정하지 않았다.

| 스킬 | 한 줄 설명 |
|---|---|
| `htmlfy` | 조사·스펙·전후 비교·보고서를 단독 실행 HTML 문서로 만들어 저장·검증하고 로컬 문서 허브로 띄운다 |
| `dcfy` | 여러 프로젝트의 미결 결정을 설명·선택지·추천안이 있는 HTML 결정 문서로 모으고, 고른 답을 프롬프트로 자동 복사한다. 붙여 넣은 응답 프롬프트는 작업으로 처리하고, 확정 기록(읽기 전용)과 조치·결과를 같은 문서에 계속 갱신한다(생성 → 응답 → 처리·확정 기록·결과 갱신) |
| `lookfy` | 디자인 시안을 요청 개수 그대로(기본 30) 서로 다른 방향으로 만들어 카드별 선택·의견이 되는 HTML 시안 문서로 띄운다 |
| `brief` | 등록 프로젝트 전체의 최근 3일 작업·다음 행동·결정을 브리핑한다 |
| `task-token-report` | 사용자가 요청한 경우에만 작업별 실제 토큰·경과 시간을 로컬 실행 로그(Claude Code 세션·서브에이전트 jsonl, 이전 형식 Codex rollout)에서 집계한다 |

## 설치

요구 사항: Node.js(dcfy·lookfy·htmlfy 스크립트), Python 3(task-token-report).

```bash
git clone https://github.com/yeonpm/agent-skills.git ~/yeonpm/agent-skills/agent-skills
~/yeonpm/agent-skills/agent-skills/install.sh          # 미리 보기: --dry-run
```

`install.sh`는 여러 번 실행해도 결과가 같다. 이미 맞는 링크는 그대로 두고, 링크가 아닌 실제 폴더가 있으면 `~/.claude/skills-install-backup/<시각>/`으로 옮긴 뒤 링크를 건다. `~/.codex/skills`에 같은 이름이 이미 있으면 그것도 이 저장소로 다시 연결한다.

## 수정 규칙

- 스킬을 고치면 이 저장소에서 바로 커밋하고 `git push`한다(사용자 지시 2026-11-26).
- 스크립트는 `~/.claude/skills/<이름>/...` 경로로 호출해도 링크를 따라 이 저장소 파일이 실행된다. 스크립트 안에서 자기 위치가 필요하면 `__dirname`/`Path(__file__).resolve()`를 쓴다.
- 비밀값·토큰·외부인 이메일을 넣지 않는다. `.bak` 파일은 커밋하지 않는다(.gitignore).
- `lm`·`lp`·`lpm`·`pm`은 [agent-skills-feature](https://github.com/yeonpm/agent-skills-feature)의 `etc/`로 옮겼다(2026-11-27).
- 특정 프로젝트·기능 전용 스킬은 [agent-skills-feature](https://github.com/yeonpm/agent-skills-feature)에 둔다.
