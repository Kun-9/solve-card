import { useMemo, useState } from "react";
import type { QuestionBank, Round, ScoreHistory, TrackMeta } from "../types";

interface CertTrackScreenProps {
  bank: QuestionBank;
  history: ScoreHistory;
  trackId: string;
  totalQuestions: number;
  onStartRound: (round: Round, shuffled: boolean) => void;
  onStartRandom: (subjectKey: string | undefined, trackId: string) => void;
  onSelectTrack: (track: TrackMeta) => void;
  onManage: () => void;
}

const ALL = "__all__" as const;
const YEAR_RE = /(\d{4})-(\d{2})-(\d{2})/;
const SUBJECT_RE = /^(\d+과목)/;

function extractDateLabel(round: Round): string | null {
  if (round.date) return round.date;
  const m = round.title.match(YEAR_RE) ?? round.id.match(/(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function extractYear(label: string | null): string | null {
  if (!label) return null;
  return label.slice(0, 4);
}

export function CertTrackScreen({
  bank,
  history,
  trackId,
  onStartRound,
  onStartRandom,
  onSelectTrack,
  onManage,
}: CertTrackScreenProps) {
  const tracksInDomain = useMemo<TrackMeta[]>(() => {
    if (bank.tracks && bank.tracks.length > 0) {
      return bank.tracks.filter((t) => t.domain === "cert");
    }
    return [];
  }, [bank]);

  const activeTrack =
    tracksInDomain.find((t) => t.id === trackId) ??
    ({ id: trackId, domain: "cert", title: trackId } as TrackMeta);

  const trackRounds = useMemo(
    () => bank.rounds.filter((r) => r.trackId === trackId),
    [bank, trackId],
  );

  const trackQuestionTotal = useMemo(
    () =>
      trackRounds.reduce(
        (sum, r) => sum + (r.questionCount ?? r.questions.length),
        0,
      ),
    [trackRounds],
  );

  const dateMap = useMemo(() => {
    const map = new Map<string, string | null>();
    trackRounds.forEach((r) => map.set(r.id, extractDateLabel(r)));
    return map;
  }, [trackRounds]);

  const years = useMemo(() => {
    const set = new Set<string>();
    trackRounds.forEach((r) => {
      const y = extractYear(dateMap.get(r.id) ?? null);
      if (y) set.add(y);
    });
    return [...set].sort();
  }, [trackRounds, dateMap]);

  const [yearFilter, setYearFilter] = useState<string>(ALL);
  const [subjectFilter, setSubjectFilter] = useState<string>(ALL);
  const [shuffled, setShuffled] = useState(false);

  const subjects = useMemo(() => {
    if (bank.subjects && bank.subjects.length > 0) {
      return bank.subjects.map((s) => ({ key: s.key, fullLabel: s.fullLabel }));
    }
    const map = new Map<string, string>();
    trackRounds.forEach((r) => {
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
  }, [bank, trackRounds]);

  const filtered = useMemo(() => {
    if (yearFilter === ALL) return trackRounds;
    return trackRounds.filter(
      (r) => extractYear(dateMap.get(r.id) ?? null) === yearFilter,
    );
  }, [trackRounds, dateMap, yearFilter]);

  const subjectCount = useMemo(() => {
    if (subjectFilter === ALL) return trackQuestionTotal;
    if (bank.subjects) {
      return bank.subjects.find((s) => s.key === subjectFilter)?.count ?? 0;
    }
    let n = 0;
    trackRounds.forEach((r) => {
      r.questions.forEach((q) => {
        const m = q.section?.match(SUBJECT_RE);
        if (m && m[1] === subjectFilter) n += 1;
      });
    });
    return n;
  }, [bank, trackRounds, subjectFilter, trackQuestionTotal]);

  const hasContent = trackRounds.length > 0;

  return (
    <div className="stack-xl stack">
      <section className="stack" style={{ gap: 16 }}>
        {tracksInDomain.length > 1 && (
          <div className="chip-row" role="radiogroup" aria-label="자격증 트랙">
            {tracksInDomain.map((t) => (
              <button
                key={t.id}
                type="button"
                className="btn-pill"
                role="radio"
                aria-checked={t.id === trackId}
                aria-pressed={t.id === trackId}
                onClick={() => {
                  if (t.id !== trackId) onSelectTrack(t);
                }}
              >
                {t.title}
              </button>
            ))}
          </div>
        )}

        <h1 className="h-display">{activeTrack.title}</h1>
        <p className="body-lg">
          {trackRounds.length}개 회차 · {trackQuestionTotal}문제
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

        <button
          type="button"
          className="random-card"
          onClick={() =>
            onStartRandom(
              subjectFilter === ALL ? undefined : subjectFilter,
              trackId,
            )
          }
          disabled={!hasContent}
        >
          <span className="random-card-meta">
            <span className="random-card-eyebrow">Shuffle &amp; Play</span>
            <span className="random-card-title">
              {subjectFilter === ALL ? "전체 랜덤" : `${subjectFilter} 랜덤`}
            </span>
            <span className="random-card-sub">
              {subjectCount}문제 중 무작위 출제
            </span>
          </span>
          <span className="random-card-dice" aria-hidden>
            <span />
            <span />
            <span />
            <span />
          </span>
        </button>
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

        {trackRounds.length === 0 ? (
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
  onStart: (round: Round) => void;
}

function RoundCard({ round, history, dateLabel, onStart }: RoundCardProps) {
  const log = history[round.id];
  const recent = log?.[0];
  const best = log?.reduce<number | null>((acc, r) => {
    const rate = r.total === 0 ? 0 : Math.round((r.correct / r.total) * 100);
    return acc === null || rate > acc ? rate : acc;
  }, null);
  const count = round.questionCount ?? round.questions.length;
  const disabled = count === 0;

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
        </div>
        <h3 className="h-card">{round.title}</h3>
        <div className="row row-between" style={{ marginTop: 4 }}>
          <span className="caption">
            {recent ? `최근 ${recent.correct}/${recent.total}` : `${count}문제`}
          </span>
          <span className="caption">
            {best !== null && best !== undefined ? `최고 ${best}%` : "미응시"}
          </span>
        </div>
      </div>
    </button>
  );
}
