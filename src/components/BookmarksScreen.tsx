import { useEffect, useMemo, useState } from "react";
import type {
  FavoriteEntry,
  FavoriteMap,
  QuestionBank,
  Round,
  RoundBookmarkMap,
} from "../types";
import {
  buildFavoritePoolRound,
  buildSinglePreviewRound,
  groupFavoritesByTrack,
  resolveFavorites,
  type FavoriteGroup,
} from "../data/favorites";
import { FavoritesDrilldown } from "./FavoritesDrilldown";
import { RoundBookmarkBtn } from "./RoundBookmarkBtn";

type Tab = "rounds" | "favorites";

interface BookmarksScreenProps {
  bank: QuestionBank;
  favorites: FavoriteMap;
  bookmarks: RoundBookmarkMap;
  onToggleFavorite: (entry: FavoriteEntry) => void;
  onToggleBookmark: (roundId: string) => void;
  onStartRound: (round: Round, shuffled: boolean) => void;
  onStartVirtualRound: (round: Round, label: string) => void;
  favoriteTrackId?: string | null;
  onSetFavoriteTrack: (trackId: string | null | undefined) => void;
}

export function BookmarksScreen({
  bank,
  favorites,
  bookmarks,
  onToggleFavorite,
  onToggleBookmark,
  onStartRound,
  onStartVirtualRound,
  favoriteTrackId,
  onSetFavoriteTrack,
}: BookmarksScreenProps) {
  const [tab, setTab] = useState<Tab>(
    favoriteTrackId !== undefined ? "favorites" : "rounds",
  );
  const [groups, setGroups] = useState<FavoriteGroup[]>([]);
  const [resolving, setResolving] = useState(false);

  const trackTitleOf = useMemo(() => {
    const map = new Map<string, string>();
    (bank.tracks ?? []).forEach((t) => map.set(t.id, t.title));
    return (id: string) => map.get(id);
  }, [bank.tracks]);

  // 즐겨찾기는 본문 lookup이 필요해 비동기.
  useEffect(() => {
    let cancelled = false;
    setResolving(true);
    void (async () => {
      const resolved = await resolveFavorites(favorites);
      if (cancelled) return;
      setGroups(groupFavoritesByTrack(resolved, trackTitleOf));
      setResolving(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [favorites, trackTitleOf]);

  const bookmarkedRounds = useMemo(() => {
    const ids = new Set(Object.keys(bookmarks));
    return bank.rounds
      .filter((r) => ids.has(r.id))
      .sort((a, b) => {
        const ta = bookmarks[a.id]?.addedAt ?? "";
        const tb = bookmarks[b.id]?.addedAt ?? "";
        return tb.localeCompare(ta);
      });
  }, [bank.rounds, bookmarks]);

  const drilldownGroup =
    favoriteTrackId !== undefined
      ? groups.find((g) => (g.trackId ?? null) === favoriteTrackId) ?? null
      : null;

  if (drilldownGroup) {
    return (
      <FavoritesDrilldown
        group={drilldownGroup}
        onBack={() => onSetFavoriteTrack(undefined)}
        onToggleFavorite={onToggleFavorite}
        onStart={(round, label) => onStartVirtualRound(round, label)}
        onPreview={(resolved) => {
          const round = buildSinglePreviewRound(resolved);
          onStartVirtualRound(round, "헷갈린 문제 미리보기");
        }}
        buildPoolRound={buildFavoritePoolRound}
      />
    );
  }

  return (
    <div className="bookmarks-screen">
      <div className="bookmarks-tabs" role="tablist" aria-label="북마크 탭">
        <button
          type="button"
          role="tab"
          className="bookmarks-tab"
          aria-pressed={tab === "rounds"}
          onClick={() => setTab("rounds")}
        >
          회차
        </button>
        <button
          type="button"
          role="tab"
          className="bookmarks-tab"
          aria-pressed={tab === "favorites"}
          onClick={() => setTab("favorites")}
        >
          헷갈린 문제
        </button>
      </div>

      {tab === "rounds" ? (
        <RoundsTab
          rounds={bookmarkedRounds}
          trackTitleOf={trackTitleOf}
          onStart={onStartRound}
          onToggleBookmark={onToggleBookmark}
        />
      ) : (
        <FavoritesTab
          groups={groups}
          loading={resolving}
          onPick={(trackId) => onSetFavoriteTrack(trackId)}
        />
      )}
    </div>
  );
}

interface RoundsTabProps {
  rounds: Round[];
  trackTitleOf: (id: string) => string | undefined;
  onStart: (round: Round, shuffled: boolean) => void;
  onToggleBookmark: (roundId: string) => void;
}

function RoundsTab({
  rounds,
  trackTitleOf,
  onStart,
  onToggleBookmark,
}: RoundsTabProps) {
  if (rounds.length === 0) {
    return (
      <div className="bookmarks-empty card empty">
        <p className="body">아직 북마크한 회차가 없어요.</p>
        <p className="caption" style={{ marginTop: 6 }}>
          회차 카드 우상단의 북마크 버튼으로 표시할 수 있어요.
        </p>
      </div>
    );
  }
  return (
    <div className="card-grid">
      {rounds.map((round) => {
        const count = round.questionCount ?? round.questions.length;
        return (
          <div key={round.id} className="card-with-corner-action">
            <button
              type="button"
              className="card card-link"
              onClick={() => onStart(round, false)}
              disabled={count === 0}
            >
              <div className="stack" style={{ gap: 14 }}>
                <span className="caption">
                  {(round.trackId ? trackTitleOf(round.trackId) : null) ??
                    "회차"}
                </span>
                <h3 className="h-card">{round.title}</h3>
                <span className="caption">{count}문제</span>
              </div>
            </button>
            <div className="card-bookmark-corner">
              <RoundBookmarkBtn
                active
                onToggle={() => onToggleBookmark(round.id)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface FavoritesTabProps {
  groups: FavoriteGroup[];
  loading: boolean;
  onPick: (trackId: string | null) => void;
}

function FavoritesTab({ groups, loading, onPick }: FavoritesTabProps) {
  if (loading) {
    return (
      <div className="bookmarks-empty card empty">
        <p className="body">불러오는 중…</p>
      </div>
    );
  }
  if (groups.length === 0) {
    return (
      <div className="bookmarks-empty card empty">
        <p className="body">아직 즐겨찾기한 문제가 없어요.</p>
        <p className="caption" style={{ marginTop: 6 }}>
          풀이 중 또는 결과 화면에서 별을 눌러 표시할 수 있어요.
        </p>
      </div>
    );
  }
  return (
    <div className="card-grid">
      {groups.map((g) => (
        <button
          key={g.trackId ?? "__etc__"}
          type="button"
          className="card card-link"
          onClick={() => onPick(g.trackId)}
        >
          <div className="stack" style={{ gap: 14 }}>
            <span className="caption">트랙</span>
            <h3 className="h-card">{g.trackTitle}</h3>
            <span className="caption">헷갈린 문제 {g.count}개</span>
          </div>
        </button>
      ))}
    </div>
  );
}
