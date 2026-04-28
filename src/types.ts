export interface Question {
  id: string;
  prompt: string;
  choices: string[];
  answerIndex: number;
  explanation?: string;
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
  explanation?: string;
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
