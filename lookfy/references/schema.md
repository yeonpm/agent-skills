# lookfy mockups.json 스키마

`scripts/build.cjs`가 읽는다. 예시: `references/example-5.json`, `references/example-30.json`(생성기 `make-examples.cjs`, 가상 앱).

```jsonc
{
  "meta": {
    "title": "캐모리 설정 화면 시안 10개",      // 필수. 프롬프트 1줄에도 쓰임
    "subtitle": "…",                          // 선택
    "date": "2026-11-25",                     // 필수(KST)
    "taskId": "DES-CAMORY-SETTINGS-0001",     // 필수, DEPT-PROJECT-WORK-NNNN
    "project": "camory",                      // config/projects.json id
    "count": 10,                              // 필수 = 사용자가 준 개수 N(없으면 30). variants 수와 다르면 build 실패
    "round": 1,                               // 기본 1
    "numbering": "continue",                  // 라운드 2+ 필수: "continue"(startNo부터 이어 번호) | "prefix"(R2-01..)
    "startNo": 11,                            // continue일 때 이전 라운드 마지막 번호 + 1
    "multi": false,                           // true면 여러 시안 선택 허용(기본 단일)
    "docPath": "…"                            // 선택. 없으면 출력 html 절대 경로(허브 URL은 자동 계산)
  },
  "summary": {
    "recommend": [{ "id": "03", "reason": "한 줄 이유" }],   // 1~2개
    "todo": "…",                              // 선택. 사용자 할 일 문구(기본 문구 있음)
    "note": "…", "extra": ["…"]               // 선택
  },
  "criteria": ["찾기 쉬움", "한 손 조작", "공간", "구현 난이도"],   // 비교표 열(모든 시안 같은 기준)
  "current": {                                // 선택. 현재안(있으면 같은 크기·조건으로)
    "name": "…", "concept": "…", "direction": "현재 화면", "problemsLabel": "라운드 1 피드백",
    "scores": { "찾기 쉬움": "보통" },
    "problems": [{ "text": "무엇이 문제인지", "area": { "x": 83, "y": 2, "w": 11, "h": 7 } }],
    "mock": { "svg": "<svg …>" }
  },
  "variants": [{                              // 정확히 count개, 순서 = 번호
    "id": "01",                               // 라운드 1: 01..N(100개 이상이면 001..)
    "name": "하단 플로팅 버튼",                 // 고유
    "direction": "떠 있는 원형 버튼",           // 고유. 서로 확실히 다른 방향(중복이면 build 실패 → 교체)
    "concept": "한 줄 콘셉트",                  // 고유
    "features": ["2~4개"],
    "pros": ["1개 이상"], "cons": ["고려할 점 1개 이상"],
    "points": [                               // 봐야 할 포인트 2~4개, "무엇을 보고 무엇을 판단할지" 한 문장
      { "text": "버튼 위치 — 엄지가 닿는지", "area": { "x": 72, "y": 79, "w": 20, "h": 15, "r": "50%" } },
      { "text": "목록을 가리는지" }           // area 없으면 텍스트 목록만(버튼 생략)
    ],
    "scores": { "찾기 쉬움": "좋음" },
    "proposal": false,                        // 원문에 없는 요소를 넣은 시안이면 true → [제안] 배지
    "mock": { "svg": "<svg viewBox=… role=img aria-label=…>" }
            // 또는 { "img": "img/v01.png", "width": 1080, "height": 1920, "alt": "…" } (문서와 같은 폴더 상대 경로)
            // 또는 { "html": "<div …>목업</div>" }
  }],
  "feedback": [{ "quote": "사용자 원문", "source": "2026-11-24 비서 대화", "applied": "03·07 하단으로 이동" }],  // 라운드 2+ 필수
  "mix": [{ "element": "…", "solves": "…", "conflicts": "…", "how": "…" }]                                 // 라운드 2+ 필수
}
```

- `area`는 시안 영역(stage) 기준 %: 이미지 픽셀 ÷ 원본 크기 × 100. 하나라도 있으면 그 시안의 포인트는 버튼(focus-points)으로, 없으면 텍스트 목록으로 나온다.
- SVG 목업은 색을 `class="m-bg|m-bar|m-item|m-fg|m-sub|m-acc|m-on|m-line|m-stroke"`로 칠하면 다크모드가 자동 대응된다(템플릿 토큰).
- 문구는 원본(프로젝트 문서·사용자 원문)에서 가져오고 추정하지 않는다. 비밀값·개인정보 금지.
