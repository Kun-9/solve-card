import { useMemo, useState } from "react";
import type {
  Difficulty,
  QuestionBank,
  Round,
  ScoreHistory,
  TrackMeta,
} from "../types";

const ALL = "__all__" as const;
const DIFF_LABEL: Record<Difficulty, string> = { 0: "하", 1: "중", 2: "상" };
const DIFF_VALUES: Difficulty[] = [0, 1, 2];

interface DevTrackScreenProps {
  bank: QuestionBank;
  history: ScoreHistory;
  trackId: string;
  onStartRound: (round: Round, shuffled: boolean) => void;
  onStartRandom: (
    subjectKey: string | undefined,
    trackId: string,
    difficulty?: Difficulty,
  ) => void;
  onSelectTrack: (track: TrackMeta) => void;
}

export function DevTrackScreen({
  bank,
  history,
  trackId,
  onStartRound,
  onStartRandom,
  onSelectTrack,
}: DevTrackScreenProps) {
  const allDevTracks = useMemo<TrackMeta[]>(
    () => (bank.tracks ?? []).filter((t) => t.domain === "dev"),
    [bank],
  );

  const activeTrack =
    allDevTracks.find((t) => t.id === trackId) ??
    ({ id: trackId, domain: "dev", title: trackId } as TrackMeta);

  const tracksInCategory = useMemo<TrackMeta[]>(
    () =>
      activeTrack.categoryId
        ? allDevTracks.filter((t) => t.categoryId === activeTrack.categoryId)
        : [activeTrack],
    [allDevTracks, activeTrack],
  );

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

  const difficultyCounts = useMemo(() => {
    const c: Record<Difficulty, number> & { unset: number } = {
      0: 0,
      1: 0,
      2: 0,
      unset: 0,
    };
    trackRounds.forEach((r) =>
      r.questions.forEach((q) => {
        if (q.difficulty === 0 || q.difficulty === 1 || q.difficulty === 2) {
          c[q.difficulty] += 1;
        } else {
          c.unset += 1;
        }
      }),
    );
    return c;
  }, [trackRounds]);

  const [difficultyFilter, setDifficultyFilter] = useState<
    Difficulty | typeof ALL
  >(ALL);
  const [shuffled, setShuffled] = useState(false);

  const randomPoolCount =
    difficultyFilter === ALL
      ? trackQuestionTotal
      : difficultyCounts[difficultyFilter];

  const hasContent = trackQuestionTotal > 0;

  return (
    <div className="stack-xl stack">
      <section className="stack" style={{ gap: 16 }}>
        {tracksInCategory.length > 1 && (
          <div className="chip-row" role="radiogroup" aria-label="형제 트랙">
            {tracksInCategory.map((t) => (
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
          {trackRounds.length}챕터 · {trackQuestionTotal}문제
        </p>

        <div className="chip-row" role="radiogroup" aria-label="난이도">
          <button
            type="button"
            className="btn-pill"
            role="radio"
            aria-checked={difficultyFilter === ALL}
            aria-pressed={difficultyFilter === ALL}
            onClick={() => setDifficultyFilter(ALL)}
          >
            전체
          </button>
          {DIFF_VALUES.map((d) => (
            <button
              key={d}
              type="button"
              className="btn-pill"
              role="radio"
              aria-checked={difficultyFilter === d}
              aria-pressed={difficultyFilter === d}
              onClick={() => setDifficultyFilter(d)}
            >
              {DIFF_LABEL[d]}
              {difficultyCounts[d] > 0 ? ` ${difficultyCounts[d]}` : ""}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="random-card"
          onClick={() =>
            onStartRandom(
              undefined,
              trackId,
              difficultyFilter === ALL ? undefined : difficultyFilter,
            )
          }
          disabled={randomPoolCount === 0 || !hasContent}
        >
          <span className="random-card-meta">
            <span className="random-card-eyebrow">Shuffle &amp; Play</span>
            <span className="random-card-title">
              {difficultyFilter === ALL
                ? `${activeTrack.title} 랜덤`
                : `${DIFF_LABEL[difficultyFilter]} 난이도 랜덤`}
            </span>
            <span className="random-card-sub">
              {randomPoolCount}문제 중 무작위 출제
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
          <span />
          <button
            type="button"
            className="shuffle-toggle"
            aria-pressed={shuffled}
            onClick={() => setShuffled((v) => !v)}
            title="챕터 클릭 시 그 챕터 안에서 무작위 순서로 출제"
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
            <p className="body">아직 등록된 챕터가 없어요.</p>
            <p className="caption" style={{ marginTop: 6 }}>
              <code>data/dev/{trackId}/&#123;chapterId&#125;.json</code> 으로
              챕터를 추가하세요.
            </p>
          </div>
        ) : (
          <div className="card-grid">
            {trackRounds.map((round) => (
              <ChapterCard
                key={round.id}
                round={round}
                history={history}
                onStart={(r) => onStartRound(r, shuffled)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

interface ChapterCardProps {
  round: Round;
  history: ScoreHistory;
  onStart: (round: Round) => void;
}

function ChapterCard({ round, history, onStart }: ChapterCardProps) {
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
        <span className="caption">CHAPTER</span>
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
