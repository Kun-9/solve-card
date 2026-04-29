import { useMemo } from "react";
import type {
  CategoryMeta,
  QuestionBank,
  ScoreHistory,
  TrackMeta,
} from "../types";

interface DevCategoryScreenProps {
  bank: QuestionBank;
  history: ScoreHistory;
  categoryId: string;
  onSelectCategory: (categoryId: string) => void;
  onSelectTrack: (track: TrackMeta) => void;
}

export function DevCategoryScreen({
  bank,
  categoryId,
  onSelectCategory,
  onSelectTrack,
}: DevCategoryScreenProps) {
  const devTracks = useMemo<TrackMeta[]>(
    () => (bank.tracks ?? []).filter((t) => t.domain === "dev"),
    [bank],
  );

  const visibleCategories = useMemo<CategoryMeta[]>(() => {
    const known = new Map<string, CategoryMeta>();
    (bank.categories ?? []).forEach((c) => known.set(c.id, c));
    devTracks.forEach((t) => {
      if (t.categoryId && !known.has(t.categoryId)) {
        known.set(t.categoryId, { id: t.categoryId, title: t.categoryId });
      }
    });
    const withTracks = new Set(
      devTracks.map((t) => t.categoryId).filter(Boolean) as string[],
    );
    return [...known.values()].filter((c) => withTracks.has(c.id));
  }, [bank.categories, devTracks]);

  const activeCategory =
    visibleCategories.find((c) => c.id === categoryId) ??
    bank.categories?.find((c) => c.id === categoryId) ?? {
      id: categoryId,
      title: categoryId,
    };

  const tracksInCategory = useMemo(
    () => devTracks.filter((t) => t.categoryId === categoryId),
    [devTracks, categoryId],
  );

  const trackStats = useMemo(() => {
    const map = new Map<string, { chapters: number; questions: number }>();
    bank.rounds.forEach((r) => {
      if (!r.trackId) return;
      const cur = map.get(r.trackId) ?? { chapters: 0, questions: 0 };
      cur.chapters += 1;
      cur.questions += r.questionCount ?? r.questions.length;
      map.set(r.trackId, cur);
    });
    return map;
  }, [bank]);

  const totalQuestions = tracksInCategory.reduce(
    (sum, t) => sum + (trackStats.get(t.id)?.questions ?? 0),
    0,
  );

  return (
    <div className="stack-xl stack">
      <section className="stack" style={{ gap: 16 }}>
        {visibleCategories.length > 1 && (
          <div className="chip-row" role="radiogroup" aria-label="개발 카테고리">
            {visibleCategories.map((c) => (
              <button
                key={c.id}
                type="button"
                className="btn-pill"
                role="radio"
                aria-checked={c.id === categoryId}
                aria-pressed={c.id === categoryId}
                onClick={() => {
                  if (c.id !== categoryId) onSelectCategory(c.id);
                }}
              >
                {c.title}
              </button>
            ))}
          </div>
        )}

        <h1 className="h-display">{activeCategory.title}</h1>
        <p className="body-lg">
          {tracksInCategory.length}트랙 · {totalQuestions}문제
        </p>
      </section>

      <section className="stack">
        {tracksInCategory.length === 0 ? (
          <div className="card empty">
            <p className="body">{activeCategory.title} 트랙은 준비 중이에요.</p>
            <p className="caption" style={{ marginTop: 6 }}>
              <code>create-question-dev</code> 스킬로 트랙을 추가하세요.
            </p>
          </div>
        ) : (
          <div className="card-grid">
            {tracksInCategory.map((track) => {
              const s = trackStats.get(track.id) ?? { chapters: 0, questions: 0 };
              const empty = s.chapters === 0;
              return (
                <button
                  key={track.id}
                  type="button"
                  className="card card-link"
                  onClick={() => onSelectTrack(track)}
                  disabled={empty}
                >
                  <div className="stack" style={{ gap: 14 }}>
                    <span className="caption">
                      {track.description ?? "Dev 트랙"}
                    </span>
                    <h3 className="h-card">{track.title}</h3>
                    <span className="caption">
                      {empty
                        ? "준비 중"
                        : `${s.chapters}챕터 · ${s.questions}문제`}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
