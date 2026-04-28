import { parseExplanation } from "../lib/explanation";
import { choiceLabel } from "../lib/utils";

interface ExplanationProps {
  /** 정답 여부. true면 correct, false면 wrong 톤. null/undefined면 중립(neutral). */
  correct?: boolean | null;
  answerIndex: number;
  choices: string[];
  explanation?: string;
  /** 카드 외곽선/배경 톤. quiz는 "card", result는 "flat". */
  variant?: "card" | "flat";
}

export function Explanation({
  correct,
  answerIndex,
  choices,
  explanation,
  variant = "card",
}: ExplanationProps) {
  const parsed = parseExplanation(explanation, choices);
  const answerText = choices[answerIndex] ?? "";
  const tone = correct === true ? "correct" : correct === false ? "wrong" : "neutral";
  const title =
    correct === true
      ? "정답이에요"
      : correct === false
        ? "아쉬워요, 정답은 다른 보기예요"
        : "정답 해설";

  return (
    <section className="explain" data-tone={tone} data-variant={variant}>
      <header className="explain-header">
        <span className="explain-title">{title}</span>
        <span className="explain-answer">
          정답 <strong>{choiceLabel(answerIndex)}</strong>. {answerText}
        </span>
      </header>

      {parsed?.summary && (
        <p className="explain-summary">{parsed.summary}</p>
      )}

      {parsed && parsed.notes.length > 0 && (
        <div className="explain-notes">
          <span className="explain-notes-label">다른 보기 살펴보기</span>
          <ul className="explain-note-list">
            {parsed.notes.map((note, i) => (
              <li key={i} className="explain-note">
                <span className="explain-note-key" aria-hidden>
                  {note.matchedIndex !== undefined ? choiceLabel(note.matchedIndex) : "·"}
                </span>
                <div className="explain-note-text">
                  <span className="explain-note-label">{note.label}</span>
                  {note.body && <span className="explain-note-body">{note.body}</span>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
