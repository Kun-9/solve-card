# solve-card

기출 문제를 카드처럼 한 장씩 푸는 웹앱입니다.
정보처리기사 필기 8회차(2020–2022), 총 800문항을 수록하고 있습니다.

## 기능

- 회차별 풀기 / 전체 무작위 풀기
- 답을 선택하면 정답·해설을 즉시 표시합니다
- 회차별 최근 점수와 최고 점수를 localStorage에 저장합니다
- 결과 화면에서 오답 노트를 제공합니다
- 모바일 환경을 지원합니다

## 시작하기

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5173`로 접속합니다.

빌드:

```bash
npm run build
npm run preview
```

문제 데이터(`public/data/index.json` + `public/data/rounds/*.json`)는
저장소에 포함되어 있어 별도 준비가 필요하지 않습니다.

## 데이터 구조

회차 메타데이터 매니페스트와 회차별 본문 파일로 분리되어 있습니다.

`public/data/index.json`

```jsonc
{
  "rounds": [
    {
      "id": "iz20200606",
      "category": "iz",
      "title": "정보처리기사 필기 · 2020-06-06",
      "description": "2020-06-06 회차 · 100문항",
      "questionCount": 100
    }
  ],
  "updatedAt": "2026-04-28T..."
}
```

`public/data/rounds/iz20200606.json`

```jsonc
{
  "id": "iz20200606",
  "title": "정보처리기사 필기 · 2020-06-06",
  "description": "2020-06-06 회차 · 100문항",
  "questions": [
    {
      "id": "iz20200606-1",
      "prompt": "...",
      "choices": ["...", "...", "...", "..."],
      "answerIndex": 2,
      "explanation": "...",
      "section": "1과목: 소프트웨어 설계"
    }
  ]
}
```

첫 진입 시 매니페스트와 회차들을 받아 localStorage에 캐시합니다.
이후에는 매니페스트의 `updatedAt`이 변경된 경우에만 다시 가져옵니다.

## 문제 관리

개발 모드(`npm run dev`)에서만 관리 화면이 노출됩니다.
회차/문항 추가·수정·삭제, JSON 가져오기/내보내기, 기출 데이터 재동기화를 지원합니다.
프로덕션 빌드에는 포함되지 않습니다.

## 기술 스택

- Vite + React + TypeScript
- localStorage (백엔드 없음)

## 배포

`main` 브랜치에 푸시되면 GitHub Actions가 GitHub Pages로 자동 배포합니다
(`.github/workflows/deploy.yml`).

최초 1회는 저장소 **Settings → Pages → Build and deployment → Source**를
**GitHub Actions**로 변경해야 합니다.

## 데이터 출처

기출 원본: [cbtbank.kr](https://cbtbank.kr)
비상업·개인 학습용. 모든 문항의 권리는 원저작자에 있음.
