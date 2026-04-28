import { useMemo, useRef, useState } from "react";
import type { Question, QuestionBank, Round } from "../types";
import {
  exportBankToFile,
  importBankFromFile,
  resetToSeed,
  resyncRemoteBank,
} from "../data/storage";
import { letterFor, uid } from "../lib/utils";

interface ManageProps {
  bank: QuestionBank;
  onChange: (next: QuestionBank) => void;
  onReplace: (next: QuestionBank) => void;
  onClose: () => void;
}

export function Manage({ bank, onChange, onReplace, onClose }: ManageProps) {
  const [activeId, setActiveId] = useState<string | null>(
    bank.rounds[0]?.id ?? null,
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string>("");

  const activeRound = useMemo(
    () => bank.rounds.find((r) => r.id === activeId) ?? null,
    [bank, activeId],
  );

  function updateRounds(rounds: Round[]) {
    onChange({ ...bank, rounds });
  }

  function addRound() {
    const id = uid("round");
    const round: Round = {
      id,
      title: `${bank.rounds.length + 1}회차`,
      description: "",
      questions: [],
    };
    updateRounds([...bank.rounds, round]);
    setActiveId(id);
  }

  function deleteRound(roundId: string) {
    if (!window.confirm("이 회차를 삭제할까요? 되돌릴 수 없어요.")) return;
    const next = bank.rounds.filter((r) => r.id !== roundId);
    updateRounds(next);
    if (activeId === roundId) setActiveId(next[0]?.id ?? null);
  }

  function patchRound(roundId: string, patch: Partial<Round>) {
    updateRounds(
      bank.rounds.map((r) => (r.id === roundId ? { ...r, ...patch } : r)),
    );
  }

  function patchQuestion(roundId: string, qid: string, patch: Partial<Question>) {
    updateRounds(
      bank.rounds.map((r) =>
        r.id === roundId
          ? {
              ...r,
              questions: r.questions.map((q) =>
                q.id === qid ? { ...q, ...patch } : q,
              ),
            }
          : r,
      ),
    );
  }

  function addQuestion(roundId: string) {
    const newQ: Question = {
      id: uid("q"),
      prompt: "",
      choices: ["", "", "", ""],
      answerIndex: 0,
      explanation: "",
    };
    updateRounds(
      bank.rounds.map((r) =>
        r.id === roundId ? { ...r, questions: [...r.questions, newQ] } : r,
      ),
    );
  }

  function deleteQuestion(roundId: string, qid: string) {
    updateRounds(
      bank.rounds.map((r) =>
        r.id === roundId
          ? { ...r, questions: r.questions.filter((q) => q.id !== qid) }
          : r,
      ),
    );
  }

  function moveQuestion(roundId: string, qid: string, direction: -1 | 1) {
    const round = bank.rounds.find((r) => r.id === roundId);
    if (!round) return;
    const idx = round.questions.findIndex((q) => q.id === qid);
    const target = idx + direction;
    if (idx < 0 || target < 0 || target >= round.questions.length) return;
    const next = round.questions.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    patchRound(roundId, { questions: next });
  }

  async function handleImport(file: File) {
    try {
      const next = await importBankFromFile(file);
      onChange(next);
      setActiveId(next.rounds[0]?.id ?? null);
      setImportMsg(`불러왔어요 · ${next.rounds.length}개 회차`);
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : "불러오기에 실패했어요.");
    }
  }

  function handleResetSample() {
    if (!window.confirm("내장 샘플 데이터로 초기화할까요?")) return;
    const next = resetToSeed();
    onChange(next);
    setActiveId(next.rounds[0]?.id ?? null);
    setImportMsg("샘플 데이터로 초기화했어요.");
  }

  async function handleResyncRemote() {
    if (
      !window.confirm(
        "기본 기출 데이터(public/data/cbt.json)로 다시 동기화할까요? 직접 추가/수정한 내용이 있다면 사라질 수 있어요.",
      )
    )
      return;
    try {
      const next = await resyncRemoteBank();
      onReplace(next);
      setActiveId(next.rounds[0]?.id ?? null);
      setImportMsg(`기출 데이터로 동기화했어요 · ${next.rounds.length}개 회차`);
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : "동기화 실패");
    }
  }

  return (
    <div className="stack-xl stack">
      <section className="stack">
        <div className="row row-between">
          <div>
            <h1 className="h-section">문제 관리</h1>
            <p className="caption">
              회차와 문제를 추가하거나, JSON으로 내보내고 가져올 수 있어요.
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            닫기
          </button>
        </div>

        <div className="toolbar">
          <button type="button" className="btn btn-primary" onClick={addRound}>
            회차 추가
          </button>
          <button
            type="button"
            className="btn btn-cream"
            onClick={() => exportBankToFile(bank)}
          >
            JSON 내보내기
          </button>
          <button
            type="button"
            className="btn btn-cream"
            onClick={() => fileRef.current?.click()}
          >
            JSON 가져오기
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleResyncRemote}>
            기출 데이터 다시 받기
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleResetSample}>
            샘플로 초기화
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImport(file);
              e.target.value = "";
            }}
          />
          {importMsg && <span className="caption">{importMsg}</span>}
        </div>
      </section>

      <section className="stack" style={{ gap: 18 }}>
        <div className="row" style={{ gap: 6 }}>
          {bank.rounds.length === 0 && (
            <span className="caption">아직 회차가 없어요. 회차 추가를 눌러보세요.</span>
          )}
          {bank.rounds.map((r) => (
            <button
              key={r.id}
              type="button"
              className="btn-pill"
              aria-pressed={r.id === activeId}
              onClick={() => setActiveId(r.id)}
            >
              {r.title || "(제목 없음)"} · {r.questions.length}
            </button>
          ))}
        </div>

        {activeRound && (
          <RoundEditor
            round={activeRound}
            onPatch={(patch) => patchRound(activeRound.id, patch)}
            onDelete={() => deleteRound(activeRound.id)}
            onAddQuestion={() => addQuestion(activeRound.id)}
            onPatchQuestion={(qid, patch) =>
              patchQuestion(activeRound.id, qid, patch)
            }
            onDeleteQuestion={(qid) => deleteQuestion(activeRound.id, qid)}
            onMoveQuestion={(qid, dir) => moveQuestion(activeRound.id, qid, dir)}
          />
        )}
      </section>
    </div>
  );
}

interface RoundEditorProps {
  round: Round;
  onPatch: (patch: Partial<Round>) => void;
  onDelete: () => void;
  onAddQuestion: () => void;
  onPatchQuestion: (qid: string, patch: Partial<Question>) => void;
  onDeleteQuestion: (qid: string) => void;
  onMoveQuestion: (qid: string, direction: -1 | 1) => void;
}

function RoundEditor({
  round,
  onPatch,
  onDelete,
  onAddQuestion,
  onPatchQuestion,
  onDeleteQuestion,
  onMoveQuestion,
}: RoundEditorProps) {
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="card stack" style={{ gap: 14 }}>
        <div className="field">
          <label className="field-label" htmlFor={`title-${round.id}`}>
            회차 제목
          </label>
          <input
            id={`title-${round.id}`}
            className="input"
            value={round.title}
            onChange={(e) => onPatch({ title: e.target.value })}
            placeholder="예) 1회차 · 워밍업"
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`desc-${round.id}`}>
            설명 (선택)
          </label>
          <input
            id={`desc-${round.id}`}
            className="input"
            value={round.description ?? ""}
            onChange={(e) => onPatch({ description: e.target.value })}
            placeholder="회차 안내 문구"
          />
        </div>
        <div className="row row-between">
          <span className="caption">{round.questions.length}개 문제</span>
          <button type="button" className="btn btn-danger btn-sm" onClick={onDelete}>
            회차 삭제
          </button>
        </div>
      </div>

      <div className="row row-between">
        <h3 className="h-card">문제 목록</h3>
        <button type="button" className="btn btn-primary btn-sm" onClick={onAddQuestion}>
          문제 추가
        </button>
      </div>

      {round.questions.length === 0 ? (
        <div className="card empty">
          <p className="body">아직 문제가 없어요. 문제 추가를 눌러 시작하세요.</p>
        </div>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          {round.questions.map((q, i) => (
            <QuestionEditor
              key={q.id}
              index={i}
              total={round.questions.length}
              question={q}
              onPatch={(patch) => onPatchQuestion(q.id, patch)}
              onDelete={() => onDeleteQuestion(q.id)}
              onMove={(dir) => onMoveQuestion(q.id, dir)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface QuestionEditorProps {
  index: number;
  total: number;
  question: Question;
  onPatch: (patch: Partial<Question>) => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
}

function QuestionEditor({
  index,
  total,
  question,
  onPatch,
  onDelete,
  onMove,
}: QuestionEditorProps) {
  function patchChoice(choiceIndex: number, value: string) {
    const next = question.choices.slice();
    next[choiceIndex] = value;
    onPatch({ choices: next });
  }

  return (
    <article className="card stack" style={{ gap: 14 }}>
      <div className="row row-between">
        <span className="caption">
          문제 {index + 1} / {total}
        </span>
        <div className="row" style={{ gap: 4 }}>
          <button
            type="button"
            className="btn btn-cream btn-sm"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            aria-label="위로 이동"
          >
            ↑
          </button>
          <button
            type="button"
            className="btn btn-cream btn-sm"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            aria-label="아래로 이동"
          >
            ↓
          </button>
          <button type="button" className="btn btn-danger btn-sm" onClick={onDelete}>
            삭제
          </button>
        </div>
      </div>

      <div className="field">
        <label className="field-label">질문</label>
        <textarea
          className="textarea"
          value={question.prompt}
          onChange={(e) => onPatch({ prompt: e.target.value })}
          placeholder="문제를 입력하세요"
        />
      </div>

      <div className="field">
        <label className="field-label">보기 (정답을 라디오로 선택)</label>
        <div className="stack" style={{ gap: 8 }}>
          {question.choices.map((choice, i) => (
            <div key={i} className="row" style={{ gap: 10 }}>
              <label className="row" style={{ gap: 6 }}>
                <input
                  type="radio"
                  name={`answer-${question.id}`}
                  checked={question.answerIndex === i}
                  onChange={() => onPatch({ answerIndex: i })}
                  aria-label={`${letterFor(i)} 보기를 정답으로 선택`}
                />
                <span className="caption" style={{ minWidth: 18 }}>
                  {letterFor(i)}
                </span>
              </label>
              <input
                className="input"
                value={choice}
                onChange={(e) => patchChoice(i, e.target.value)}
                placeholder={`보기 ${letterFor(i)}`}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="field-label">해설 (선택)</label>
        <textarea
          className="textarea"
          value={question.explanation ?? ""}
          onChange={(e) => onPatch({ explanation: e.target.value })}
          placeholder="정답에 대한 짧은 설명"
        />
      </div>
    </article>
  );
}
