import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Difficulty,
  Domain,
  FavoriteEntry,
  FavoriteMap,
  InProgressSession,
  QuestionBank,
  Round,
  RoundBookmarkMap,
  RoundResult,
  TrackMeta,
} from "./types";
import {
  addBookmark,
  addFavorite,
  addFavoritesBulk,
  appendResult,
  clearInProgressSession,
  ensureAllRounds,
  ensureRound,
  loadBankAsync,
  loadBookmarks,
  loadFavorites,
  loadHistory,
  loadHistoryAsync,
  loadInProgressSessions,
  migrateLegacyHistoryIfNeeded,
  removeBookmark,
  removeFavorite,
  removeFavoritesBulk,
  saveBank,
  saveInProgressSession,
  setAuthUserId,
} from "./data/storage";
import { FAVORITE_PREVIEW_PREFIX } from "./data/favorites";
import { HomeHub } from "./components/HomeHub";
import { CertTrackScreen } from "./components/CertTrackScreen";
import { DevCategoryScreen } from "./components/DevCategoryScreen";
import { DevTrackScreen } from "./components/DevTrackScreen";
import { Quiz } from "./components/Quiz";
import { Result } from "./components/Result";
import { Manage } from "./components/Manage";
import { Topbar } from "./components/Topbar";
import { BookmarksScreen } from "./components/BookmarksScreen";
import { useConfirm } from "./components/ConfirmDialog";
import { shuffle } from "./lib/utils";
import { useAuth } from "./lib/useAuth";

type EntryRoute =
  | { name: "home"; domain?: Domain }
  | { name: "cert"; trackId: string }
  | { name: "dev-category"; categoryId: string }
  | { name: "dev-track"; trackId: string }
  | { name: "bookmarks"; favoriteTrackId?: string | null };

interface QuizProgressState {
  currentIndex: number;
  selections: Record<string, number>;
}

type Route =
  | EntryRoute
  | {
      name: "quiz";
      round: Round;
      mode: "ordered" | "random";
      sourceLabel: string;
      origin: EntryRoute;
      startedAt: string;
      initialProgress?: QuizProgressState;
    }
  | { name: "result"; result: RoundResult; origin: EntryRoute }
  | { name: "manage" };

function originOf(prev: Route): EntryRoute {
  if (prev.name === "quiz" || prev.name === "result") return prev.origin;
  if (prev.name === "manage") return { name: "home" };
  return prev;
}

const RANDOM_POOL_SIZE = 20;
const EMPTY_BANK: QuestionBank = { rounds: [], updatedAt: "" };

interface NavHandlers {
  goHome: (domain?: Domain) => Promise<void> | void;
  goCategory: (categoryId: string) => Promise<void> | void;
}

interface NavInfo {
  backLabel?: string;
  onBack?: () => void;
  activeDomain?: Domain;
  onSwitchDomain?: (domain: Domain) => void;
}

function buildNavigation(
  route: Route,
  bank: QuestionBank,
  h: NavHandlers,
): NavInfo {
  const tracks = bank.tracks ?? [];
  const categories = bank.categories ?? [];
  const trackCategoryId = (id: string) =>
    tracks.find((t) => t.id === id)?.categoryId;
  const categoryTitle = (id: string) =>
    categories.find((c) => c.id === id)?.title ?? id;

  const switchDomain = (d: Domain) => void h.goHome(d);

  switch (route.name) {
    case "home":
      return {};
    case "cert":
      return {
        backLabel: "Home",
        onBack: () => void h.goHome("cert"),
        activeDomain: "cert",
        onSwitchDomain: switchDomain,
      };
    case "dev-category":
      return {
        backLabel: "Home",
        onBack: () => void h.goHome("dev"),
        activeDomain: "dev",
        onSwitchDomain: switchDomain,
      };
    case "dev-track": {
      const categoryId = trackCategoryId(route.trackId);
      const parent = categoryId ? categoryTitle(categoryId) : "Dev";
      return {
        backLabel: parent,
        onBack: categoryId
          ? () => void h.goCategory(categoryId)
          : () => void h.goHome("dev"),
        activeDomain: "dev",
        onSwitchDomain: switchDomain,
      };
    }
    case "quiz":
    case "result":
    case "manage":
      return {};
    case "bookmarks":
      return {
        backLabel: "Home",
        onBack: () => void h.goHome(),
      };
  }
}

export function App() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const confirm = useConfirm();

  const [bank, setBank] = useState<QuestionBank>(EMPTY_BANK);
  const [history, setHistory] = useState(() => loadHistory());
  const [inProgress, setInProgress] = useState<Record<string, InProgressSession>>({});
  const [favorites, setFavorites] = useState<FavoriteMap>({});
  const [bookmarks, setBookmarks] = useState<RoundBookmarkMap>({});
  const [route, setRoute] = useState<Route>({ name: "home" });
  const [bootState, setBootState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    setAuthUserId(userId);
    setBootState("loading");
    (async () => {
      try {
        if (userId) {
          await migrateLegacyHistoryIfNeeded(userId);
        }
        const [nextBank, nextHistory, nextInProgress, nextFavorites, nextBookmarks] =
          await Promise.all([
            loadBankAsync(),
            loadHistoryAsync(),
            loadInProgressSessions(),
            loadFavorites(),
            loadBookmarks(),
          ]);
        if (cancelled) return;
        setBank(nextBank);
        setHistory(nextHistory);
        setInProgress(nextInProgress);
        setFavorites(nextFavorites);
        setBookmarks(nextBookmarks);
        setBootState("ready");
      } catch {
        if (cancelled) return;
        setBootState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, authLoading]);

  useEffect(() => {
    if (route.name !== "home") {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [route]);

  const updateBank = useCallback((next: QuestionBank) => {
    saveBank(next);
    setBank(next);
  }, []);

  const replaceBank = useCallback((next: QuestionBank) => {
    setBank(next);
  }, []);

  const quizAttemptedRef = useRef(false);

  const handleQuizAttemptedChange = useCallback((attempted: boolean) => {
    quizAttemptedRef.current = attempted;
  }, []);

  const requestExitQuiz = useCallback(async (): Promise<boolean> => {
    if (!quizAttemptedRef.current) return true;
    // ordered 모드는 [이어 풀기]에 자동 저장되므로 confirm 생략
    if (route.name === "quiz" && route.mode === "ordered") {
      quizAttemptedRef.current = false;
      return true;
    }
    const ok = await confirm({
      title: "그만두기",
      message: "나가면 진행한 답변이 사라져요.\n그만두시겠어요?",
      confirmLabel: "그만두기",
      variant: "danger",
    });
    if (ok) quizAttemptedRef.current = false;
    return ok;
  }, [route, confirm]);

  const goHome = useCallback(
    async (domain?: Domain) => {
      if (!(await requestExitQuiz())) return;
      setRoute(domain ? { name: "home", domain } : { name: "home" });
    },
    [requestExitQuiz],
  );
  const goManage = useCallback(async () => {
    if (!import.meta.env.DEV) return;
    if (!(await requestExitQuiz())) return;
    setRoute({ name: "manage" });
  }, [requestExitQuiz]);

  const goBookmarks = useCallback(async () => {
    if (!(await requestExitQuiz())) return;
    setRoute({ name: "bookmarks" });
  }, [requestExitQuiz]);

  const toggleFavorite = useCallback(
    (entry: FavoriteEntry) => {
      setFavorites((prev) => {
        if (prev[entry.questionId]) {
          return removeFavorite(entry.questionId);
        }
        return addFavorite(entry);
      });
    },
    [],
  );

  const bulkAddFavorites = useCallback((entries: FavoriteEntry[]) => {
    if (entries.length === 0) return;
    setFavorites(addFavoritesBulk(entries));
  }, []);

  const bulkRemoveFavorites = useCallback((questionIds: string[]) => {
    if (questionIds.length === 0) return;
    setFavorites(removeFavoritesBulk(questionIds));
  }, []);

  const toggleBookmark = useCallback((roundId: string) => {
    setBookmarks((prev) =>
      prev[roundId] ? removeBookmark(roundId) : addBookmark(roundId),
    );
  }, []);

  const goTrack = useCallback(
    async (track: TrackMeta) => {
      if (!(await requestExitQuiz())) return;
      if (track.domain === "cert") {
        setRoute({ name: "cert", trackId: track.id });
      } else {
        setRoute({ name: "dev-track", trackId: track.id });
      }
    },
    [requestExitQuiz],
  );

  const goCategory = useCallback(
    async (categoryId: string) => {
      if (!(await requestExitQuiz())) return;
      setRoute({ name: "dev-category", categoryId });
    },
    [requestExitQuiz],
  );

  /** 메모리 안에서 만든 가상 Round(즐겨찾기 모아풀기 등)를 풀이로 시작. */
  const startVirtualRound = useCallback((round: Round, label: string) => {
    setRoute((prev) => ({
      name: "quiz",
      round,
      mode: "random",
      sourceLabel: label,
      origin: originOf(prev),
      startedAt: new Date().toISOString(),
    }));
  }, []);

  const startRound = useCallback(async (meta: Round, shuffled = false) => {
    const full = await ensureRound(meta.id);
    if (!full || full.questions.length === 0) return;
    const questions = shuffled ? shuffle(full.questions) : full.questions;
    // ordered 모드 새로 시작 = 같은 round의 미완료 세션은 폐기
    if (!shuffled) {
      clearInProgressSession(full.id);
      setInProgress((m) => {
        if (!(full.id in m)) return m;
        const next = { ...m };
        delete next[full.id];
        return next;
      });
    }
    setRoute((prev) => ({
      name: "quiz",
      round: { ...full, questions },
      mode: shuffled ? "random" : "ordered",
      sourceLabel: shuffled ? `${full.title} · 셔플` : full.title,
      origin: originOf(prev),
      startedAt: new Date().toISOString(),
    }));
  }, []);

  const resumeRound = useCallback(
    async (roundId: string) => {
      const session = inProgress[roundId];
      if (!session) return;
      const full = await ensureRound(roundId);
      if (!full || full.questions.length === 0) return;
      setRoute((prev) => ({
        name: "quiz",
        round: full,
        mode: "ordered",
        sourceLabel: session.sourceLabel || full.title,
        origin: originOf(prev),
        startedAt: session.startedAt,
        initialProgress: {
          currentIndex: session.currentIndex,
          selections: session.selections,
        },
      }));
    },
    [inProgress],
  );

  const discardInProgress = useCallback((roundId: string) => {
    clearInProgressSession(roundId);
    setInProgress((m) => {
      if (!(roundId in m)) return m;
      const next = { ...m };
      delete next[roundId];
      return next;
    });
  }, []);

  const startRandom = useCallback(
    async (subjectKey?: string, trackId?: string, difficulty?: Difficulty) => {
      const full = await ensureAllRounds();
      const scopedRounds = trackId
        ? full.rounds.filter((r) => r.trackId === trackId)
        : full.rounds;
      // 합성 round의 questions는 원본 회차 추적이 필요 — 즐겨찾기 추가 시 본문 lookup에 사용.
      let pool = scopedRounds.flatMap((r) =>
        r.questions.map((q) => ({
          ...q,
          sourceRoundId: q.sourceRoundId ?? r.id,
          sourceTrackId: q.sourceTrackId ?? r.trackId,
        })),
      );
      if (subjectKey) {
        pool = pool.filter((q) => q.section?.startsWith(subjectKey));
      }
      if (difficulty !== undefined) {
        pool = pool.filter((q) => q.difficulty === difficulty);
      }
      if (pool.length === 0) return;
      const picked = shuffle(pool).slice(
        0,
        Math.min(RANDOM_POOL_SIZE, pool.length),
      );
      const trackTitle = trackId
        ? (full.tracks?.find((t) => t.id === trackId)?.title ?? trackId)
        : null;
      const subjectPart = subjectKey ?? "전체";
      const diffPart =
        difficulty === 0
          ? "하"
          : difficulty === 1
            ? "중"
            : difficulty === 2
              ? "상"
              : null;
      const labelParts = [trackTitle, diffPart ?? subjectPart, "랜덤"].filter(
        Boolean,
      );
      const label = labelParts.join(" · ");
      const round: Round = {
        id: `random-${trackId ?? "all"}-${subjectKey ?? "all"}-${difficulty ?? "all"}-${Date.now()}`,
        trackId,
        title: label,
        description: `${pool.length}문제 중 ${picked.length}문제를 무작위로 출제합니다.`,
        questions: picked,
      };
      setRoute((prev) => ({
        name: "quiz",
        round,
        mode: "random",
        sourceLabel: label,
        origin: originOf(prev),
        startedAt: new Date().toISOString(),
      }));
    },
    [],
  );

  const handleQuizProgress = useCallback(
    (progress: QuizProgressState) => {
      if (route.name !== "quiz") return;
      if (route.mode !== "ordered") return;
      const session: InProgressSession = {
        roundId: route.round.id,
        roundTitle: route.round.title,
        sourceLabel: route.sourceLabel,
        total: route.round.questions.length,
        startedAt: route.startedAt,
        updatedAt: new Date().toISOString(),
        currentIndex: progress.currentIndex,
        selections: progress.selections,
      };
      saveInProgressSession(session);
      setInProgress((m) => ({ ...m, [session.roundId]: session }));
    },
    [route],
  );

  const finishQuiz = useCallback((result: RoundResult) => {
    // 미리보기는 결과 화면을 띄우지 않고 곧장 북마크로 복귀
    if (result.roundId.startsWith(FAVORITE_PREVIEW_PREFIX)) {
      setRoute((prev) =>
        prev.name === "quiz" && prev.origin.name === "bookmarks"
          ? prev.origin
          : { name: "bookmarks" },
      );
      return;
    }
    const next = appendResult(result);
    setHistory(next);
    clearInProgressSession(result.roundId);
    setInProgress((m) => {
      if (!(result.roundId in m)) return m;
      const out = { ...m };
      delete out[result.roundId];
      return out;
    });
    setRoute((prev) => ({
      name: "result",
      result,
      origin: prev.name === "quiz" ? prev.origin : { name: "home" },
    }));
  }, []);

  const exitQuiz = useCallback(async () => {
    if (!(await requestExitQuiz())) return;
    setRoute((prev) => (prev.name === "quiz" ? prev.origin : { name: "home" }));
  }, [requestExitQuiz]);

  const totalQuestions = useMemo(
    () =>
      bank.rounds.reduce(
        (sum, r) => sum + (r.questionCount ?? r.questions.length),
        0,
      ),
    [bank],
  );

  if (bootState === "loading") {
    return (
      <div className="app-shell">
        <Topbar
          current="home"
          onHome={goHome}
          onManage={goManage}
          onBookmarks={goBookmarks}
        />
        <main>
          <div className="container">
            <div className="card empty">문제 데이터를 불러오는 중…</div>
          </div>
        </main>
      </div>
    );
  }

  const topbarCurrent: "home" | "manage" | "bookmarks" =
    route.name === "manage"
      ? "manage"
      : route.name === "bookmarks"
        ? "bookmarks"
        : "home";

  const nav = buildNavigation(route, bank, { goHome, goCategory });

  return (
    <div className="app-shell">
      <Topbar
        current={topbarCurrent}
        backLabel={nav.backLabel}
        onBack={nav.onBack}
        activeDomain={nav.activeDomain}
        onSwitchDomain={nav.onSwitchDomain}
        onHome={goHome}
        onManage={goManage}
        onBookmarks={goBookmarks}
      />
      <main>
        <div className="container">
          {route.name === "home" && (
            <HomeHub
              bank={bank}
              onSelectTrack={goTrack}
              onSelectCategory={goCategory}
              onManage={goManage}
              inProgress={Object.values(inProgress)}
              onResume={resumeRound}
              onDiscardInProgress={discardInProgress}
              initialDomain={route.domain}
            />
          )}
          {route.name === "cert" && (
            <CertTrackScreen
              key={route.trackId}
              bank={bank}
              history={history}
              trackId={route.trackId}
              totalQuestions={totalQuestions}
              onStartRound={(round, shuffled) => startRound(round, shuffled)}
              onStartRandom={startRandom}
              onSelectTrack={goTrack}
              onManage={goManage}
              bookmarks={bookmarks}
              onToggleBookmark={toggleBookmark}
            />
          )}
          {route.name === "dev-category" && (
            <DevCategoryScreen
              bank={bank}
              history={history}
              categoryId={route.categoryId}
              onSelectCategory={goCategory}
              onSelectTrack={goTrack}
            />
          )}
          {route.name === "dev-track" && (
            <DevTrackScreen
              bank={bank}
              history={history}
              trackId={route.trackId}
              onStartRound={(round, shuffled) => startRound(round, shuffled)}
              onStartRandom={startRandom}
              onSelectTrack={goTrack}
              bookmarks={bookmarks}
              onToggleBookmark={toggleBookmark}
            />
          )}
          {route.name === "quiz" && (
            <Quiz
              round={route.round}
              mode={route.mode}
              sourceLabel={route.sourceLabel}
              onFinish={finishQuiz}
              onExit={exitQuiz}
              onAttemptedChange={handleQuizAttemptedChange}
              initialProgress={route.initialProgress}
              onProgress={
                route.mode === "ordered" ? handleQuizProgress : undefined
              }
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
            />
          )}
          {route.name === "result" && (
            <Result
              result={route.result}
              onClose={() => setRoute(route.origin)}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
              onBulkAddFavorites={bulkAddFavorites}
              onBulkRemoveFavorites={bulkRemoveFavorites}
              roundTrackId={
                bank.rounds.find((r) => r.id === route.result.roundId)?.trackId
              }
            />
          )}
          {route.name === "manage" && (
            <Manage
              bank={bank}
              onChange={updateBank}
              onReplace={replaceBank}
              onClose={goHome}
            />
          )}
          {route.name === "bookmarks" && (
            <BookmarksScreen
              bank={bank}
              favorites={favorites}
              bookmarks={bookmarks}
              onToggleFavorite={toggleFavorite}
              onToggleBookmark={toggleBookmark}
              onStartRound={(round, shuffled) => startRound(round, shuffled)}
              onStartVirtualRound={startVirtualRound}
              favoriteTrackId={route.favoriteTrackId}
              onSetFavoriteTrack={(id) =>
                setRoute(
                  id === undefined
                    ? { name: "bookmarks" }
                    : { name: "bookmarks", favoriteTrackId: id },
                )
              }
            />
          )}
        </div>
      </main>
    </div>
  );
}
