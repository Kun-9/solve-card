export type Domain = "cert" | "dev";

/**
 * 문제 난이도. 0=하, 1=중, 2=상.
 * 숫자로 둬서 정렬·필터에 그대로 쓸 수 있게 한다.
 * Cert 문제는 비워두고, Dev 문제는 0/1/2 중 하나.
 */
export type Difficulty = 0 | 1 | 2;
export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  0: "하",
  1: "중",
  2: "상",
};

export interface CategoryMeta {
  id: string;
  title: string;
  description?: string;
}

export interface TrackMeta {
  id: string;
  domain: Domain;
  /** Dev 분야 전용 — `QuestionBank.categories[].id` 참조 (자유 슬러그). */
  categoryId?: string;
  title: string;
  description?: string;
}

export interface ExplanationNote {
  /** 0-based 보기 인덱스. 보기 매칭 시에만 채워짐. */
  choiceIndex?: number;
  /** 노트 항목명 (예: "동료 검토", "Builder", "{ }"). */
  label: string;
  /** 부연 설명. 빈 문자열 허용. */
  body: string;
}

export interface ExplanationContent {
  /** 정답 핵심 설명. 빈 문자열 허용 (보기 분류형 해설 등). */
  summary: string;
  /** 보기별/항목별 부연. 없으면 빈 배열. */
  notes: ExplanationNote[];
}

export interface Question {
  id: string;
  prompt: string;
  choices: string[];
  answerIndex: number;
  explanation?: ExplanationContent;
  section?: string;
  /** 문제 본문 이미지. public 상대 경로 또는 dataURL. */
  imageUrl?: string;
  /** 보기별 이미지. choices와 같은 인덱스. 빈 슬롯은 null/undefined. */
  choiceImageUrls?: (string | null | undefined)[];
  /** 문제 난이도(0/1/2). Dev 트랙에서만 채워지고 Cert 는 비움. */
  difficulty?: Difficulty;
  /** 런타임 한정. 랜덤·즐겨찾기 풀 등 합성 회차에서 원본 회차를 추적하기 위함. JSON에는 없음. */
  sourceRoundId?: string;
  /** 런타임 한정. 위와 짝. 즐겨찾기 트랙 그룹핑에 사용. */
  sourceTrackId?: string;
}

export interface Round {
  id: string;
  /** 소속 트랙 id (예: izeng, iccom, spring) — Phase 1 이후 채워진다. */
  trackId?: string;
  title: string;
  description?: string;
  questions: Question[];
  /** 메타-only(lazy) 모드에서 questions가 비어 있어도 카운트를 표시할 수 있도록 함. */
  questionCount?: number;
  /** Cert 회차 전용. ISO date "YYYY-MM-DD". */
  date?: string;
}

export interface SubjectMeta {
  key: string;
  fullLabel: string;
  count: number;
}

export interface QuestionBank {
  rounds: Round[];
  /** 트랙(자격증/Dev 트랙) 메타 목록. 없으면 Cert 단일 트랙으로 폴백. */
  tracks?: TrackMeta[];
  /** Dev 카테고리 메타 목록. 데이터 기반 — 새 카테고리는 data/dev/tracks.json 에 추가. */
  categories?: CategoryMeta[];
  updatedAt: string;
  /** 메타 모드에서 Home 등이 본문 없이 과목 칩을 그릴 수 있도록 미리 집계한 값. */
  subjects?: SubjectMeta[];
}

export interface AnswerLog {
  questionId: string;
  selectedIndex: number;
  correct: boolean;
  prompt: string;
  choices: string[];
  answerIndex: number;
  explanation?: ExplanationContent;
  section?: string;
  imageUrl?: string;
  choiceImageUrls?: (string | null | undefined)[];
  /** 즐겨찾기 추가 시 원본 회차를 추적. 합성 회차일 때만 의미 있음. */
  sourceRoundId?: string;
  sourceTrackId?: string;
}

export interface RoundResult {
  roundId: string;
  roundTitle: string;
  total: number;
  correct: number;
  finishedAt: string;
  durationMs: number;
  logs: AnswerLog[];
  mode: "ordered" | "random";
}

export type ScoreHistory = Record<string, RoundResult[]>;

/**
 * 이어풀기용 미완료 세션 스냅샷.
 * - ordered 모드 한정 (random 은 셔플 결과가 매번 달라져 미저장)
 * - selections 는 questionId → 선택 보기 인덱스
 */
export interface InProgressSession {
  roundId: string;
  roundTitle: string;
  sourceLabel: string;
  total: number;
  startedAt: string;
  updatedAt: string;
  currentIndex: number;
  selections: Record<string, number>;
}

/**
 * 헷갈리는 문제 즐겨찾기 1건.
 * 본문(prompt/choices)은 들고 있지 않다 — roundId로 ensureRound 후 questionId로 lookup.
 */
export interface FavoriteEntry {
  questionId: string;
  roundId: string;
  trackId?: string;
  addedAt: string;
}

export type FavoriteMap = Record<string, FavoriteEntry>;

export interface RoundBookmark {
  roundId: string;
  addedAt: string;
}

export type RoundBookmarkMap = Record<string, RoundBookmark>;
