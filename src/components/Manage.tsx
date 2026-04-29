import { useEffect, useMemo, useRef, useState } from "react";
import type { Difficulty, Question, QuestionBank, Round } from "../types";

const DIFFICULTY_OPTIONS: { value: Difficulty | undefined; label: string }[] = [
  { value: undefined, label: "없음" },
  { value: 0, label: "하" },
  { value: 1, label: "중" },
  { value: 2, label: "상" },
];
import {
  ensureAllRounds,
  exportBankToFile,
  importBankFromFile,
  resetToSeed,
  resyncRemoteBank,
  saveBankToFile,
} from "../data/storage";
import { choiceLabel, readImageAsDataUrl, resolveImageUrl, uid } from "../lib/utils";
import { useConfirm } from "./ConfirmDialog";

interface ManageProps {
  bank: QuestionBank;
  onChange: (next: QuestionBank) => void;
  onReplace: (next: QuestionBank) => void;
  onClose: () => void;
}

export function Manage({ bank, onChange, onReplace, onClose }: ManageProps) {
  const confirm = useConfirm();
  const [draft, setDraft] = useState<QuestionBank>({
    rounds: [],
    updatedAt: bank.updatedAt ?? "",
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [savedMsg, setSavedMsg] = useState<string>("");
  const [importMsg, setImportMsg] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  // 외부에서 bank가 바뀔 때(import/reset/resync) 본문 포함 풀 데이터를 보장한다.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    ensureAllRounds()
      .then((full) => {
        if (cancelled) return;
        setDraft(full);
        setActiveId((prev) => prev ?? full.rounds[0]?.id ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bank]);

  const activeRound = useMemo(
    () => draft.rounds.find((r) => r.id === activeId) ?? null,
    [draft, activeId],
  );

  function setRounds(rounds: Round[]) {
    setDraft((prev) => ({ ...prev, rounds }));
  }

  function addRound() {
    const id = uid("round");
    const round: Round = {
      id,
      title: `${draft.rounds.length + 1}회차`,
      description: "",
      questions: [],
    };
    setRounds([...draft.rounds, round]);
    setActiveId(id);
  }

  async function deleteRound(roundId: string) {
    const ok = await confirm({
      title: "회차 삭제",
      message: "이 회차를 삭제할까요?\n저장 후에는 되돌릴 수 없어요.",
      confirmLabel: "삭제",
      variant: "danger",
    });
    if (!ok) return;
    const next = draft.rounds.filter((r) => r.id !== roundId);
    setRounds(next);
    if (activeId === roundId) setActiveId(next[0]?.id ?? null);
  }

  function patchRound(roundId: string, patch: Partial<Round>) {
    setRounds(
      draft.rounds.map((r) => (r.id === roundId ? { ...r, ...patch } : r)),
    );
  }

  function patchQuestion(roundId: string, qid: string, patch: Partial<Question>) {
    setRounds(
      draft.rounds.map((r) =>
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
      explanation: { summary: "", notes: [] },
    };
    setRounds(
      draft.rounds.map((r) =>
        r.id === roundId ? { ...r, questions: [...r.questions, newQ] } : r,
      ),
    );
  }

  function deleteQuestion(roundId: string, qid: string) {
    setRounds(
      draft.rounds.map((r) =>
        r.id === roundId
          ? { ...r, questions: r.questions.filter((q) => q.id !== qid) }
          : r,
      ),
    );
  }

  function moveQuestion(roundId: string, qid: string, direction: -1 | 1) {
    const round = draft.rounds.find((r) => r.id === roundId);
    if (!round) return;
    const idx = round.questions.findIndex((q) => q.id === qid);
    const target = idx + direction;
    if (idx < 0 || target < 0 || target >= round.questions.length) return;
    const next = round.questions.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    patchRound(roundId, { questions: next });
  }

  async function handleSave() {
    onChange(draft);
    setSavedMsg("저장 중…");
    const result = await saveBankToFile(draft);
    if (result.ok) {
      setSavedMsg("저장 완료 · public/data/ 갱신");
    } else {
      setSavedMsg(`로컬 저장됨 · 파일 반영 실패(${result.error})`);
    }
    window.setTimeout(() => setSavedMsg(""), 2600);
  }

  function handleRevert() {
    setDraft(bank);
    setSavedMsg("");
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

  async function handleResetSample() {
    const ok = await confirm({
      title: "샘플 데이터로 초기화",
      message: "내장 샘플 데이터로 초기화할까요?",
      confirmLabel: "초기화",
      variant: "danger",
    });
    if (!ok) return;
    const next = resetToSeed();
    onChange(next);
    setActiveId(next.rounds[0]?.id ?? null);
    setImportMsg("샘플 데이터로 초기화했어요.");
  }

  async function handleResyncRemote() {
    const ok = await confirm({
      title: "기본 데이터로 동기화",
      message:
        "기본 기출 데이터로 다시 동기화할까요?\n직접 추가/수정한 내용이 있다면 사라질 수 있어요.",
      confirmLabel: "동기화",
      variant: "danger",
    });
    if (!ok) return;
    try {
      const next = await resyncRemoteBank();
      onReplace(next);
      setActiveId(next.rounds[0]?.id ?? null);
      setImportMsg(`기출 데이터로 동기화했어요 · ${next.rounds.length}개 회차`);
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : "동기화 실패");
    }
  }

  if (loading) {
    return (
      <div className="stack-xl stack">
        <div className="card empty">문제 데이터를 준비 중…</div>
      </div>
    );
  }

  return (
    <div className="stack-xl stack">
      <section className="stack">
        <div className="row row-between">
          <div>
            <h1 className="h-section">문제 관리</h1>
            <p className="caption">
              편집한 내용은 <strong>저장</strong>을 눌러야 반영돼요.
            </p>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleRevert}>
              되돌리기
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleSave}>
              저장
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              닫기
            </button>
          </div>
        </div>

        <div className="toolbar">
          <button type="button" className="btn btn-cream" onClick={addRound}>
            회차 추가
          </button>
          <button
            type="button"
            className="btn btn-cream"
            onClick={() => exportBankToFile(draft)}
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
          {savedMsg && <span className="caption">{savedMsg}</span>}
          {importMsg && <span className="caption">{importMsg}</span>}
        </div>
      </section>

      <section className="stack" style={{ gap: 18 }}>
        <div className="row" style={{ gap: 6 }}>
          {draft.rounds.length === 0 && (
            <span className="caption">아직 회차가 없어요. 회차 추가를 눌러보세요.</span>
          )}
          {draft.rounds.map((r) => (
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
            <div key={i} className="choice-edit-row">
              <label className="row" style={{ gap: 6 }}>
                <input
                  type="radio"
                  name={`answer-${question.id}`}
                  checked={question.answerIndex === i}
                  onChange={() => onPatch({ answerIndex: i })}
                  aria-label={`${choiceLabel(i)} 보기를 정답으로 선택`}
                />
                <span className="caption" style={{ minWidth: 18 }}>
                  {choiceLabel(i)}
                </span>
              </label>
              <input
                className="input"
                value={choice}
                onChange={(e) => patchChoice(i, e.target.value)}
                placeholder={`보기 ${choiceLabel(i)}`}
              />
              <ChoiceImageButton
                imageUrl={question.choiceImageUrls?.[i] ?? undefined}
                onChange={(url) => {
                  const base = question.choiceImageUrls
                    ? question.choiceImageUrls.slice()
                    : question.choices.map(() => null);
                  base[i] = url ?? null;
                  const allEmpty = base.every((v) => !v);
                  onPatch({ choiceImageUrls: allEmpty ? undefined : base });
                }}
              />
            </div>
          ))}
        </div>
      </div>

      <ImageField
        imageUrl={question.imageUrl}
        onChange={(url) => onPatch({ imageUrl: url })}
      />

      <div className="field">
        <label className="field-label">난이도 (선택 · 0=하, 1=중, 2=상)</label>
        <div className="chip-row" role="radiogroup" aria-label="문제 난이도">
          {DIFFICULTY_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              className="btn-pill"
              role="radio"
              aria-checked={question.difficulty === opt.value}
              aria-pressed={question.difficulty === opt.value}
              onClick={() => onPatch({ difficulty: opt.value })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="field-label">해설 (선택)</label>
        <textarea
          className="textarea"
          value={question.explanation?.summary ?? ""}
          onChange={(e) =>
            onPatch({
              explanation: {
                summary: e.target.value,
                notes: question.explanation?.notes ?? [],
              },
            })
          }
          placeholder="정답에 대한 짧은 설명"
        />
      </div>
    </article>
  );
}

interface ChoiceImageButtonProps {
  imageUrl?: string;
  onChange: (url: string | undefined) => void;
}

function ChoiceImageButton({ imageUrl, onChange }: ChoiceImageButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>("");

  async function handleFile(file: File) {
    setError("");
    try {
      const dataUrl = await readImageAsDataUrl(file);
      onChange(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "이미지 추가 실패");
    }
  }

  return (
    <div className="choice-image-button" data-state={imageUrl ? "filled" : "empty"}>
      {imageUrl ? (
        <>
          <button
            type="button"
            className="choice-image-thumb"
            onClick={() => inputRef.current?.click()}
            title={error || "클릭해서 교체"}
            aria-label="보기 이미지 교체"
          >
            <img src={resolveImageUrl(imageUrl)} alt="" />
          </button>
          <button
            type="button"
            className="choice-image-remove"
            onClick={(e) => {
              e.stopPropagation();
              onChange(undefined);
            }}
            aria-label="보기 이미지 제거"
            title="제거"
          >
            <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </>
      ) : (
        <button
          type="button"
          className="choice-image-add"
          onClick={() => inputRef.current?.click()}
          title={error || "보기에 이미지 추가"}
          aria-label="보기 이미지 추가"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="8.5" cy="10.5" r="1.5" fill="currentColor" />
            <path d="M21 16l-5-5-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

interface ImageFieldProps {
  imageUrl?: string;
  onChange: (url: string | undefined) => void;
}

function ImageField({ imageUrl, onChange }: ImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>("");

  async function handleFile(file: File) {
    setError("");
    try {
      const dataUrl = await readImageAsDataUrl(file);
      onChange(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "이미지 추가에 실패했어요.");
    }
  }

  return (
    <div className="field">
      <label className="field-label">이미지 (선택)</label>
      {imageUrl ? (
        <div className="image-field-preview">
          <img src={resolveImageUrl(imageUrl)} alt="문제 이미지 미리보기" />
          <div className="row" style={{ gap: 6 }}>
            <button
              type="button"
              className="btn btn-cream btn-sm"
              onClick={() => inputRef.current?.click()}
            >
              교체
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => {
                onChange(undefined);
                setError("");
              }}
            >
              제거
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="image-field-empty"
          onClick={() => inputRef.current?.click()}
        >
          이미지 추가
          <span className="caption">PNG · JPG · 최대 1.5MB</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      {error && <span className="caption" style={{ color: "var(--wrong)" }}>{error}</span>}
    </div>
  );
}
