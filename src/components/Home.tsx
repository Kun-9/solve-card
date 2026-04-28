import { useMemo, useState } from "react";
import type { QuestionBank, Round, ScoreHistory } from "../types";

interface HomeProps {
  bank: QuestionBank;
  history: ScoreHistory;
  totalQuestions: number;
  onStartRound: (round: Round, shuffled: boolean) => void;
  onStartRandom: (subjectKey?: string) => void;
  onManage: () => void;
}

const ALL = "__all__" as const;
const YEAR_RE = /(\d{4})-(\d{2})-(\d{2})/;
const SUBJECT_RE = /^(\d+과목)/;

function extractDateLabel(round: Round): string | null {
  const m = round.title.match(YEAR_RE) ?? round.id.match(/(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function extractYear(label: string | null): string | null {
  if (!label) return null;
  return label.slice(0, 4);
}

export function Home({
  bank,
  history,
  totalQuestions,
  onStartRound,
  onStartRandom,
  onManage,
}: HomeProps) {
  const hasContent = totalQuestions > 0;

  const dateMap = useMemo(() => {
    const map = new Map<string, string | null>();
    bank.rounds.forEach((r) => map.set(r.id, extractDateLabel(r)));
    return map;
  }, [bank]);

  const years = useMemo(() => {
    const set = new Set<string>();
    bank.rounds.forEach((r) => {
      const y = extractYear(dateMap.get(r.id) ?? null);
      if (y) set.add(y);
    });
    return [...set].sort();
  }, [bank, dateMap]);

  const [yearFilter, setYearFilter] = useState<string>(ALL);
  const [subjectFilter, setSubjectFilter] = useState<string>(ALL);
  const [shuffled, setShuffled] = useState(false);

  const subjects = useMemo(() => {
    const map = new Map<string, string>();
    bank.rounds.forEach((r) => {
      r.questions.forEach((q) => {
        if (!q.section) return;
        const m = q.section.match(SUBJECT_RE);
        if (!m) return;
        const key = m[1];
        if (!map.has(key)) map.set(key, q.section);
      });
    });
    return [...map.entries()]
      .map(([key, fullLabel]) => ({ key, fullLabel }))
      .sort((a, b) => a.key.localeCompare(b.key, "ko"));
  }, [bank]);

  const filtered = useMemo(() => {
    if (yearFilter === ALL) return bank.rounds;
    return bank.rounds.filter(
      (r) => extractYear(dateMap.get(r.id) ?? null) === yearFilter,
    );
  }, [bank, dateMap, yearFilter]);

  return (
    <div className="stack-xl stack">
      <section className="stack" style={{ gap: 16 }}>
        <h1 className="h-display">기출, 한 장씩.</h1>
        <p className="body-lg">
          {bank.rounds.length}개 회차 · {totalQuestions}문제
        </p>

        {subjects.length > 0 && (
          <div className="chip-row" role="radiogroup" aria-label="랜덤 풀이 과목">
            <button
              type="button"
              className="btn-pill"
              role="radio"
              aria-checked={subjectFilter === ALL}
              aria-pressed={subjectFilter === ALL}
              onClick={() => setSubjectFilter(ALL)}
            >
              전체
            </button>
            {subjects.map((s) => (
              <button
                key={s.key}
                type="button"
                className="btn-pill"
                role="radio"
                aria-checked={subjectFilter === s.key}
                aria-pressed={subjectFilter === s.key}
                onClick={() => setSubjectFilter(s.key)}
                title={s.fullLabel}
              >
                {s.key}
              </button>
            ))}
          </div>
        )}

        <div className="row" style={{ marginTop: 2 }}>
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={() =>
              onStartRandom(subjectFilter === ALL ? undefined : subjectFilter)
            }
            disabled={!hasContent}
          >
            {subjectFilter === ALL ? "전체 랜덤" : `${subjectFilter} 랜덤`}
          </button>
          {import.meta.env.DEV && (
            <button type="button" className="btn btn-ghost btn-lg" onClick={onManage}>
              문제 관리
            </button>
          )}
        </div>
      </section>

      <section className="stack">
        <div className="row row-between" style={{ gap: 12, flexWrap: "wrap" }}>
          {years.length > 1 ? (
            <div className="chip-row">
              <button
                type="button"
                className="btn-pill"
                aria-pressed={yearFilter === ALL}
                onClick={() => setYearFilter(ALL)}
              >
                전체
              </button>
              {years.map((y) => (
                <button
                  key={y}
                  type="button"
                  className="btn-pill"
                  aria-pressed={yearFilter === y}
                  onClick={() => setYearFilter(y)}
                >
                  {y}년
                </button>
              ))}
            </div>
          ) : (
            <span />
          )}

          <button
            type="button"
            className="shuffle-toggle"
            aria-pressed={shuffled}
            onClick={() => setShuffled((v) => !v)}
            title="회차를 클릭하면 그 회차 안에서 무작위 순서로 출제"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M16 3h5v5M4 20l16.5-16.5M21 16v5h-5M15 15l5.5 5.5M4 4l5 5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            셔플 {shuffled ? "ON" : "OFF"}
          </button>
        </div>

        {bank.rounds.length === 0 ? (
          <div className="card empty">
            <p className="body">아직 등록된 회차가 없어요.</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onManage}
              style={{ marginTop: 12 }}
            >
              첫 회차 만들기
            </button>
          </div>
        ) : (
          <div className="card-grid">
            {filtered.map((round) => (
              <RoundCard
                key={round.id}
                round={round}
                history={history}
                dateLabel={dateMap.get(round.id) ?? null}
                shuffled={shuffled}
                onStart={(r) => onStartRound(r, shuffled)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

interface RoundCardProps {
  round: Round;
  history: ScoreHistory;
  dateLabel: string | null;
  shuffled: boolean;
  onStart: (round: Round) => void;
}

function RoundCard({ round, history, dateLabel, shuffled, onStart }: RoundCardProps) {
  const log = history[round.id];
  const recent = log?.[0];
  const best = log?.reduce<number | null>((acc, r) => {
    const rate = r.total === 0 ? 0 : Math.round((r.correct / r.total) * 100);
    return acc === null || rate > acc ? rate : acc;
  }, null);
  const disabled = round.questions.length === 0;

  return (
    <button
      type="button"
      className="card card-link"
      onClick={() => onStart(round)}
      disabled={disabled}
    >
      <div className="stack" style={{ gap: 14 }}>
        <div className="row row-between" style={{ alignItems: "center" }}>
          <span className="caption">{dateLabel ?? round.id}</span>
          {shuffled && <span className="tag tag-shuffle">셔플</span>}
        </div>
        <h3 className="h-card">{round.title}</h3>
        <div className="row row-between" style={{ marginTop: 4 }}>
          <span className="caption">
            {recent
              ? `최근 ${recent.correct}/${recent.total}`
              : `${round.questions.length}문제`}
          </span>
          <span className="caption">
            {best !== null && best !== undefined ? `최고 ${best}%` : "안 품"}
          </span>
        </div>
      </div>
    </button>
  );
}
