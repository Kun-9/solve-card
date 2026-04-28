# 문제 데이터 아키텍처

solve-card의 문제 데이터는 **회차별 파일 + 매니페스트** 구조입니다. 단일 번들로 묶지 않아 회차 단위로 관리·캐싱·확장이 가능합니다.

## 파일 구조

```
public/data/
  index.json              ← 매니페스트 (회차 메타 + 과목 집계 + 회차별 version)
  rounds/
    iz20200606.json       ← 회차 본문 (questions 포함)
    iz20200822.json
    ...
    ic20230617.json
  cbt-images/<roundId>/   ← 회차별 이미지 자산
```

원본은 `cbtbank/data/{prefix}{YYYYMMDD}.json`이며, `npm run build:cbt`(또는 `predev`/`prebuild` 훅)가 위 구조로 변환합니다.

## 매니페스트 스키마 (`public/data/index.json`)

```jsonc
{
  "rounds": [
    {
      "id": "iz20200606",
      "category": "iz",                 // 자격증 prefix (iz=정보처리, ic=정보통신)
      "title": "정보처리기사 필기 · 2020-06-06",
      "description": "2020-06-06 회차 · 100문항",
      "questionCount": 100,
      "version": "09db533f171c"         // 회차 본문 sha1 12자 — 변경 감지용
    }
  ],
  "subjects": [
    { "key": "1과목", "fullLabel": "1과목: 소프트웨어 설계", "count": 160 }
  ],
  "updatedAt": "2026-04-28T08:23:01.772Z"
}
```

회차 본문은 메타에 없는 `questions: Question[]`만 포함합니다.

## 런타임 로딩 흐름

| 액션 | 새 fetch |
|---|---|
| 첫 진입(Home) | `index.json` 1개 (~2KB) |
| 회차 카드 클릭 | 그 회차 1개 |
| 랜덤 클릭 | 매니페스트의 모든 회차 (병렬, 첫 클릭만) |
| Manage 진입 | 모든 회차 (병렬, 캐시 후 즉시) |
| 같은 회차 재방문 | 0건 (`version` 일치 시 캐시 사용) |

`storage.ts`의 진입점:

- `loadBankAsync()` — 매니페스트만 fetch, **메타-only** `QuestionBank` 반환 (`questions=[]`, `questionCount` 채움)
- `ensureRound(id)` — 회차 본문 lazy 로드 (캐시 우선)
- `ensureAllRounds()` — 모든 회차 본문 보장 (랜덤·Manage용)

App·Home·Quiz는 `bank` 객체 인터페이스를 통해서만 접근하므로, 분할/lazy는 storage 레이어 내부에 갇혀 있습니다.

## 캐시 전략 (localStorage)

| 키 | 값 |
|---|---|
| `solve-card:manifest:v2` | 매니페스트 본체 |
| `solve-card:round:v2:{id}` | `{ round, version }` — 매니페스트의 `version`과 비교해 invalidate |
| `solve-card:history:v1` | 회차별 응시 결과 |

회차 본문이 바뀌면 build 단계에서 새 sha1이 매니페스트에 박히고, 클라이언트는 다음 로드 시 그 회차만 다시 받습니다. 사용자가 Manage에서 직접 편집·저장한 경우 `version`이 `"user-modified"`로 표시되어 원격 매니페스트로 덮이지 않습니다.

## 자격증·회차 추가

새 회차:
1. `cbtbank/data/{prefix}{YYYYMMDD}.json`에 원본 추가
2. `scripts/build-cbt.mjs`의 `FILES` 배열에 회차 ID 등록
3. `npm run build:cbt`

새 자격증(prefix):
1. 위 두 단계
2. `scripts/build-cbt.mjs`의 `TITLE_BY_PREFIX`에 라벨 등록 (예: `pe: "기사 필기"`)
3. (선택) 매니페스트의 `category` 필드를 활용한 UI 분리는 추후 작업

## dev 서버에서 직접 편집

`npm run dev` 실행 시 화면 우측 "문제 관리" 진입 → 편집 → 저장.
- 클라이언트는 풀 bank를 `POST /__save-bank`로 전송
- `vite.config.ts`의 미들웨어가 받아서 매니페스트 + 회차별 파일로 **분할 저장**
- 새 bank에 없는 회차 파일은 자동 정리
- data URL 이미지는 `public/data/cbt-images/<roundId>/`로 외부화
