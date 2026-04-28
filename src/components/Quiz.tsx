import { useEffect, useMemo, useRef, useState } from "react";
import type { AnswerLog, Round, RoundResult } from "../types";
import { letterFor, resolveImageUrl } from "../lib/utils";

interface QuizProps {
  round: Round;
  mode: "ordered" | "random";
  sourceLabel: string;
  onFinish: (result: RoundResult) => void;
  onExit: () => void;
}

interface AttemptState {
  selectedIndex: number | null;
  revealed: boolean;
}

export function Quiz({ round, mode, sourceLabel, onFinish, onExit }: QuizProps) {
  const [index, setIndex] = useState(0);
  const [attempts, setAttempts] = useState<AttemptState[]>(() =>
    round.questions.map(() => ({ selectedIndex: null, revealed: false })),
  );
  const startedAt = useRef<number>(Date.now());

  const total = round.questions.length;
  const current = round.questions[index];
  const attempt = attempts[index];
  const isLast = index === total - 1;
  const progress = useMemo(() => {
    const answered = attempts.filter((a) => a.revealed).length;
    return Math.round((answered / total) * 100);
  }, [attempts, total]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [index]);

  function selectChoice(choiceIndex: number) {
    if (attempt.revealed) return;
    setAttempts((prev) =>
      prev.map((a, i) =>
        i === index ? { selectedIndex: choiceIndex, revealed: true } : a,
      ),
    );
  }

  function next() {
    if (!attempt.revealed) return;
    if (isLast) {
      finalize();
      return;
    }
    setIndex((i) => i + 1);
  }

  function finalize() {
    const logs: AnswerLog[] = round.questions.map((q, i) => {
      const a = attempts[i];
      const selected = a.selectedIndex ?? -1;
      return {
        questionId: q.id,
        prompt: q.prompt,
        choices: q.choices,
        answerIndex: q.answerIndex,
        selectedIndex: selected,
        correct: selected === q.answerIndex,
        explanation: q.explanation,
        section: q.section,
        imageUrl: q.imageUrl,
      };
    });
    const correct = logs.filter((l) => l.correct).length;
    const result: RoundResult = {
      roundId: round.id,
      roundTitle: round.title,
      total,
      correct,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.current,
      logs,
      mode,
    };
    onFinish(result);
  }

  function confirmExit() {
    if (attempts.some((a) => a.revealed)) {
      const ok = window.confirm("나가면 진행한 답변이 사라져요. 그만두시겠어요?");
      if (!ok) return;
    }
    onExit();
  }

  return (
    <div className="stack-lg stack">
      <header className="quiz-header">
        <button
          type="button"
          className="quiz-icon-btn"
          onClick={confirmExit}
          aria-label="그만두기"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div className="quiz-progress" aria-label={`진행률 ${progress}%`}>
          <div className="quiz-progress-meta">
            <span className="quiz-progress-count">
              {String(index + 1).padStart(2, "0")}
              <span className="quiz-progress-total"> / {String(total).padStart(2, "0")}</span>
            </span>
            <span className="caption quiz-source">{sourceLabel}</span>
          </div>
          <div className="progress-bar">
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>

        <button
          type="button"
          className="btn btn-primary quiz-next"
          disabled={!attempt.revealed}
          onClick={next}
        >
          {isLast ? "결과 보기" : "다음"}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M9 6l6 6-6 6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </header>

      <article className="card card-lg stack" style={{ gap: 16 }}>
        {current.section && <span className="caption">{current.section}</span>}
        <h2 className="h-card" style={{ fontSize: 22, lineHeight: 1.35 }}>
          {current.prompt}
        </h2>

        {current.imageUrl && (
          <figure className="question-figure">
            <img src={resolveImageUrl(current.imageUrl)} alt="문제 이미지" loading="lazy" />
          </figure>
        )}

        <div className="choice-list">
          {current.choices.map((choice, i) => (
            <ChoiceButton
              key={i}
              index={i}
              text={choice}
              attempt={attempt}
              answerIndex={current.answerIndex}
              onSelect={() => selectChoice(i)}
            />
          ))}
        </div>

        {attempt.revealed && (
          <Feedback
            correct={attempt.selectedIndex === current.answerIndex}
            answerLetter={letterFor(current.answerIndex)}
            answerText={current.choices[current.answerIndex]}
            explanation={current.explanation}
          />
        )}
      </article>
    </div>
  );
}

interface ChoiceButtonProps {
  index: number;
  text: string;
  attempt: AttemptState;
  answerIndex: number;
  onSelect: () => void;
}

function ChoiceButton({
  index,
  text,
  attempt,
  answerIndex,
  onSelect,
}: ChoiceButtonProps) {
  const state = computeChoiceState(index, attempt, answerIndex);
  const isEmpty = text.trim().length === 0;
  return (
    <button
      type="button"
      className="choice"
      data-state={state}
      disabled={attempt.revealed}
      onClick={onSelect}
    >
      <span className="choice-key">{letterFor(index)}</span>
      <span className="choice-text" data-empty={isEmpty || undefined}>
        {isEmpty ? "이미지 보기" : text}
      </span>
    </button>
  );
}

function computeChoiceState(
  index: number,
  attempt: AttemptState,
  answerIndex: number,
): string {
  if (!attempt.revealed) {
    return attempt.selectedIndex === index ? "selected" : "default";
  }
  if (index === answerIndex) {
    return attempt.selectedIndex === answerIndex ? "correct" : "reveal-correct";
  }
  if (index === attempt.selectedIndex) return "wrong";
  return "default";
}

interface FeedbackProps {
  correct: boolean;
  answerLetter: string;
  answerText: string;
  explanation?: string;
}

function Feedback({ correct, answerLetter, answerText, explanation }: FeedbackProps) {
  return (
    <div className="feedback" data-tone={correct ? "correct" : "wrong"}>
      <p className="feedback-title">
        {correct ? "정답이에요" : "아쉬워요, 정답은 다른 보기예요"}
      </p>
      <p className="feedback-body">
        정답 <strong>{answerLetter}</strong>. {answerText}
        {explanation ? ` — ${explanation}` : ""}
      </p>
    </div>
  );
}
