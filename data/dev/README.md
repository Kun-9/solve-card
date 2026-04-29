# Dev 학습 콘텐츠

이 디렉토리는 **개발 학습용(Dev 분야)** 문제 데이터의 원본 소스다. git 트래킹 대상.

## 파일 구조

```
data/dev/
├── tracks.json                       # 트랙 메타 (id, domain, category, title, description)
└── {trackId}/
    └── {chapterId}.json              # 챕터별 문제 세트 (DevChapterFile)
```

## 작성 방법

`create-question-dev` 스킬을 사용한다. (`.claude/skills/create-question-dev/SKILL.md` 참조)

직접 손으로 쓰는 건 권장하지 않는다 — 스킬이 작성 원칙·난이도 분포·검증까지 가이드한다.

## 빌드

```bash
npm run build:cbt
```

`scripts/build-cbt.mjs` 가 `cbtbank/data/{iz,ic}*` (cert) 와 `data/dev/**` (dev) 를 함께 읽어 `public/data/index.json` + `public/data/rounds/{round_id}.json` 으로 변환한다.

## Cert 와의 차이

| | Cert | Dev |
|---|---|---|
| 원본 위치 | `cbtbank/data/` (gitignored) | `data/dev/` (git tracked) |
| 단위 | 회차(date) | 챕터(topic) |
| 메타 칩 | 과목 + 연도 | 난이도(0=하/1=중/2=상) |
| 분야 전체 랜덤 | ❌ | ✅ |
