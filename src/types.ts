export interface Question {
  id: string;
  prompt: string;
  choices: string[];
  answerIndex: number;
  explanation?: string;
  section?: string;
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
