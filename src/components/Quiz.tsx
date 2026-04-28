import { useEffect, useMemo, useRef, useState } from "react";
import type { AnswerLog, Round, RoundResult } from "../types";
import { choiceLabel, resolveImageUrl } from "../lib/utils";

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

const SWIPE_THRESHOLD = 60;

export function Quiz({ round, mode, sourceLabel, onFinish, onExit }: QuizProps) {
  const [index, setIndex] = useState(0);
  const [attempts, setAttempts] = useState<AttemptState[]>(() =>
    round.questions.map(() => ({ selectedIndex: null, revealed: false })),
  );
  const startedAt = useRef<number>(Date.now());
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

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

  function skip() {
    if (isLast) {
      finalize();
      return;
    }
    setIndex((i) => i + 1);
  }

  function prev() {
    if (index === 0) return;
    setIndex((i) => i - 1);
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
        choiceImageUrls: q.choiceImageUrls,
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

  // 키보드 단축키: ← / → 이동, 1-N으로 보기 선택
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (attempt.revealed) next();
        else skip();
        return;
      }
      const num = Number(e.key);
      if (Number.isInteger(num) && num >= 1 && num <= current.choices.length) {
        e.preventDefault();
        selectChoice(num - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, attempt.revealed, current.choices.length]);

  // 모바일 좌/우 스와이프
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    swipeStart.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) {
      // 왼쪽으로 스와이프 → 다음/스킵
      if (attempt.revealed) next();
      else skip();
    } else {
      prev();
    }
  }

  const rightLabel = isLast
    ? "결과 보기"
    : attempt.revealed
      ? "다음 문제"
      : "건너뛰기";
  const rightPrimary = attempt.revealed || isLast;

  return (
    <div
      className="quiz-shell"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
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
              imageUrl={current.choiceImageUrls?.[i] ?? undefined}
              attempt={attempt}
              answerIndex={current.answerIndex}
              onSelect={() => selectChoice(i)}
            />
          ))}
        </div>

        {attempt.revealed && (
          <Feedback
            correct={attempt.selectedIndex === current.answerIndex}
            answerLetter={choiceLabel(current.answerIndex)}
            answerText={current.choices[current.answerIndex]}
            explanation={current.explanation}
          />
        )}
      </article>

      <nav className="quiz-actionbar" aria-label="문제 이동">
        <div className="quiz-actionbar-inner">
          <button
            type="button"
            className="btn btn-ghost quiz-action-prev"
            onClick={prev}
            disabled={index === 0}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M15 18l-6-6 6-6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            이전
          </button>
          <button
            type="button"
            className={`btn ${rightPrimary ? "btn-primary" : "btn-ghost"} quiz-action-next`}
            onClick={() => (attempt.revealed ? next() : skip())}
          >
            {rightLabel}
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
        </div>
      </nav>
    </div>
  );
}

interface ChoiceButtonProps {
  index: number;
  text: string;
  imageUrl?: string;
  attempt: AttemptState;
  answerIndex: number;
  onSelect: () => void;
}

function ChoiceButton({
  index,
  text,
  imageUrl,
  attempt,
  answerIndex,
  onSelect,
}: ChoiceButtonProps) {
  const state = computeChoiceState(index, attempt, answerIndex);
  const isTextEmpty = text.trim().length === 0;
  const showPlaceholder = isTextEmpty && !imageUrl;
  return (
    <button
      type="button"
      className="choice"
      data-state={state}
      disabled={attempt.revealed}
      onClick={onSelect}
    >
      <span className="choice-key">{choiceLabel(index)}</span>
      <span className="choice-body">
        {!isTextEmpty && <span className="choice-text">{text}</span>}
        {imageUrl && (
          <span className="choice-image">
            <img src={resolveImageUrl(imageUrl)} alt="" loading="lazy" />
          </span>
        )}
        {showPlaceholder && (
          <span className="choice-text" data-empty>
            (보기 없음)
          </span>
        )}
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
