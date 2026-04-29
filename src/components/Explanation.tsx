import type { ExplanationContent, ExplanationNote } from "../types";
import { choiceLabel } from "../lib/utils";

function sortNotes(notes: ExplanationNote[] | undefined): ExplanationNote[] {
  if (!notes?.length) return [];
  return notes
    .map((note, i) => ({ note, i }))
    .sort((a, b) => {
      const ai = a.note.choiceIndex;
      const bi = b.note.choiceIndex;
      const aHas = typeof ai === "number";
      const bHas = typeof bi === "number";
      if (aHas && bHas) return ai - bi || a.i - b.i;
      if (aHas) return -1;
      if (bHas) return 1;
      return a.i - b.i;
    })
    .map(({ note }) => note);
}

interface ExplanationProps {
  /** true=correct, false=wrong, null/undefined=neutral */
  correct?: boolean | null;
  answerIndex: number;
  choices: string[];
  explanation?: ExplanationContent;
  /** quiz는 "card", result 오답 노트는 "flat". */
  variant?: "card" | "flat";
}

export function Explanation({
  correct,
  answerIndex,
  choices,
  explanation,
  variant = "card",
}: ExplanationProps) {
  const answerText = choices[answerIndex] ?? "";
  const tone = correct === true ? "correct" : correct === false ? "wrong" : "neutral";
  const title =
    correct === true
      ? "정답이에요"
      : correct === false
        ? "아쉬워요, 정답은 다른 보기예요"
        : "정답 해설";

  const summary = explanation?.summary?.trim() ?? "";
  const notes = sortNotes(explanation?.notes);

  return (
    <section className="explain" data-tone={tone} data-variant={variant}>
      <header className="explain-header">
        <span className="explain-title">{title}</span>
        <span className="explain-answer">
          정답 <strong>{choiceLabel(answerIndex)}</strong>. {answerText}
        </span>
      </header>

      {summary && <p className="explain-summary">{summary}</p>}

      {notes.length > 0 && (
        <div className="explain-notes">
          <span className="explain-notes-label">다른 보기 살펴보기</span>
          <ul className="explain-note-list">
            {notes.map((note, i) => (
              <li key={i} className="explain-note">
                <span className="explain-note-key" aria-hidden>
                  {note.choiceIndex !== undefined
                    ? choiceLabel(note.choiceIndex)
                    : "·"}
                </span>
                <div className="explain-note-text">
                  <span className="explain-note-label">{note.label}</span>
                  {note.body && (
                    <span className="explain-note-body">{note.body}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
