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
}

export interface Round {
  id: string;
  title: string;
  description?: string;
  questions: Question[];
}

export interface QuestionBank {
  rounds: Round[];
  updatedAt: string;
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
