# solve-card

기출 문제를 카드 한 장씩 풀어보는 웹 앱.
정보처리기사 필기 8회차(2020–2022) 800문항이 기본으로 들어 있다.

## 기능

- 회차별 풀기 / 전체 무작위 풀기
- 답을 고르면 즉시 정답·해설 표시
- 회차별 최근 점수와 최고 점수 기록 (localStorage)
- 결과 화면의 오답 노트
- 모바일 대응

## 시작하기

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5173` 접속.

빌드:

```bash
npm run build
npm run preview
```

문제 데이터(`public/data/cbt.json`)는 저장소에 포함되어 있어 별도 준비 없이 바로 실행된다.

## 데이터 구조

`public/data/cbt.json`

```jsonc
{
  "rounds": [
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
  ],
  "updatedAt": "2026-04-28T..."
}
```

앱은 첫 진입 시 이 파일을 가져와 localStorage에 캐시한다.
이후에는 `updatedAt`이 바뀌었을 때만 다시 받아온다.

## 문제 관리

개발 환경(`npm run dev`)에서만 문제 관리 화면이 노출된다.
회차/문항 추가·수정·삭제, JSON 가져오기/내보내기, 기출 데이터 재동기화가 가능하다.
프로덕션 빌드에는 포함되지 않는다.

## 기술 스택

- Vite + React + TypeScript
- localStorage (별도 백엔드 없음)

## 배포

`main` 브랜치에 푸시되면 GitHub Actions가 GitHub Pages로 자동 배포한다
(`.github/workflows/deploy.yml`).

처음 한 번은 저장소의 **Settings → Pages → Build and deployment → Source**를
**GitHub Actions**로 바꿔주어야 한다.

## 데이터 출처

기출 원본은 [cbtbank.kr](https://cbtbank.kr) 에서 가져왔다.
학습 목적으로만 사용한다.
