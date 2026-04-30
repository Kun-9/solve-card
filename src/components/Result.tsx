import { useMemo } from "react";
import type { FavoriteEntry, FavoriteMap, RoundResult } from "../types";
import { formatDuration, choiceLabel, resolveImageUrl } from "../lib/utils";
import { Explanation } from "./Explanation";
import { FavoriteStar } from "./FavoriteStar";
import { Markdown } from "./Markdown";

interface ResultProps {
  result: RoundResult;
  onRetry: () => void;
  onHome: () => void;
  favorites: FavoriteMap;
  onToggleFavorite: (entry: FavoriteEntry) => void;
  onBulkRemoveFavorites: (questionIds: string[]) => void;
  /** 결과 회차의 trackId. 즐겨찾기 추가 시 동일 트랙으로 묶이도록 함. */
  roundTrackId?: string;
}

export function Result({
  result,
  onRetry,
  onHome,
  favorites,
  onToggleFavorite,
  onBulkRemoveFavorites,
  roundTrackId,
}: ResultProps) {
  const rate = result.total === 0 ? 0 : Math.round((result.correct / result.total) * 100);
  const wrong = result.logs.filter((l) => !l.correct);

  const correctlyFavored = useMemo(
    () =>
      result.logs
        .filter((l) => l.correct && favorites[l.questionId])
        .map((l) => l.questionId),
    [result.logs, favorites],
  );

  const logsById = useMemo(() => {
    const map = new Map<string, (typeof result.logs)[number]>();
    for (const l of result.logs) map.set(l.questionId, l);
    return map;
  }, [result.logs]);

  const makeEntry = (questionId: string): FavoriteEntry => {
    const log = logsById.get(questionId);
    return {
      questionId,
      roundId: log?.sourceRoundId ?? result.roundId,
      trackId: log?.sourceTrackId ?? roundTrackId,
      addedAt: new Date().toISOString(),
    };
  };

  return (
    <div className="stack-xl stack">
      <section className="stack">
        <span className="tag">
          {result.mode === "random" ? "랜덤 풀기" : "회차 풀기"} · {result.roundTitle}
        </span>
        <h1 className="h-display">{summaryHeadline(rate)}</h1>
        <p className="body-lg">
          {result.correct}문제를 맞췄어요. {formatDuration(result.durationMs)} 동안 풀었습니다.
        </p>
      </section>

      <section className="card card-lg stack" style={{ gap: 18 }}>
        <div className="row row-between">
          <span className="caption">정답률</span>
          <span className="caption">
            {result.correct} / {result.total}
          </span>
        </div>
        <div>
          <span className="score-big">{rate}</span>
          <span className="score-unit">%</span>
        </div>
        <div className="progress-bar" style={{ marginTop: 4 }}>
          <span style={{ width: `${rate}%` }} />
        </div>
      </section>

      {correctlyFavored.length > 0 && (
        <div className="tidy-banner" role="status">
          <svg
            className="tidy-banner-icon"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
          >
            <path d="M12 3.5l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 17l-5.3 2.8 1.1-5.9L3.4 9.8l6-.8z" />
          </svg>
          <span className="tidy-banner-text">
            이번에 맞힌 즐겨찾기 <strong>{correctlyFavored.length}개</strong>
          </span>
          <button
            type="button"
            className="tidy-banner-btn"
            onClick={() => onBulkRemoveFavorites(correctlyFavored)}
          >
            별 빼기
          </button>
        </div>
      )}

      <section className="stack">
        <div className="row row-between">
          <h2 className="h-section">오답 노트</h2>
          <span className="caption">{wrong.length}개</span>
        </div>
        {wrong.length === 0 ? (
          <div className="card empty">
            <p className="body">전부 맞췄어요. 멋져요.</p>
          </div>
        ) : (
          <div className="stack" style={{ gap: 12 }}>
            {wrong.map((log) => (
              <article key={log.questionId} className="card stack" style={{ gap: 10 }}>
                <div className="row row-between" style={{ alignItems: "center" }}>
                  {log.section ? (
                    <span className="caption">{log.section}</span>
                  ) : (
                    <span />
                  )}
                  <FavoriteStar
                    active={Boolean(favorites[log.questionId])}
                    size={18}
                    onToggle={() => onToggleFavorite(makeEntry(log.questionId))}
                  />
                </div>
                <div
                  className="body prompt-md"
                  style={{ color: "var(--charcoal)", fontWeight: 600 }}
                >
                  <Markdown>{log.prompt}</Markdown>
                </div>
                {log.imageUrl && (
                  <figure className="question-figure question-figure-sm">
                    <img src={resolveImageUrl(log.imageUrl)} alt="문제 이미지" loading="lazy" />
                  </figure>
                )}
                {log.choiceImageUrls?.some((u) => u) && (
                  <div className="choice-image-thumb-row">
                    {log.choiceImageUrls.map((url, i) =>
                      url ? (
                        <span key={i} className="choice-image-thumb-tag">
                          <span className="caption">{choiceLabel(i)}</span>
                          <img src={resolveImageUrl(url)} alt="" loading="lazy" />
                        </span>
                      ) : null,
                    )}
                  </div>
                )}
                <p className="caption">
                  내 답:{" "}
                  {log.selectedIndex >= 0
                    ? `${choiceLabel(log.selectedIndex)}. ${log.choices[log.selectedIndex]}`
                    : "선택하지 않음"}
                </p>
                <Explanation
                  correct={false}
                  answerIndex={log.answerIndex}
                  choices={log.choices}
                  explanation={log.explanation}
                  variant="flat"
                />
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="row">
        <button type="button" className="btn btn-primary btn-lg" onClick={onRetry}>
          다시 풀기
        </button>
        <button type="button" className="btn btn-ghost btn-lg" onClick={onHome}>
          홈으로
        </button>
      </div>
    </div>
  );
}

function summaryHeadline(rate: number): string {
  if (rate === 100) return "완벽해요!";
  if (rate >= 80) return "거의 다 맞췄어요.";
  if (rate >= 50) return "꽤 잘했어요.";
  if (rate > 0) return "다음엔 더 잘할 수 있어요.";
  return "처음이니까 괜찮아요.";
}
