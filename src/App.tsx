import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Difficulty,
  InProgressSession,
  QuestionBank,
  Round,
  RoundResult,
  TrackMeta,
} from "./types";
import {
  appendResult,
  clearInProgressSession,
  ensureAllRounds,
  ensureRound,
  loadBankAsync,
  loadHistory,
  loadHistoryAsync,
  loadInProgressSessions,
  migrateLegacyHistoryIfNeeded,
  saveBank,
  saveInProgressSession,
  setAuthUserId,
} from "./data/storage";
import { HomeHub } from "./components/HomeHub";
import { CertTrackScreen } from "./components/CertTrackScreen";
import { DevCategoryScreen } from "./components/DevCategoryScreen";
import { DevTrackScreen } from "./components/DevTrackScreen";
import { Quiz } from "./components/Quiz";
import { Result } from "./components/Result";
import { Manage } from "./components/Manage";
import { Topbar } from "./components/Topbar";
import { shuffle } from "./lib/utils";
import { useAuth } from "./lib/useAuth";

type EntryRoute =
  | { name: "home" }
  | { name: "cert"; trackId: string }
  | { name: "dev-category"; categoryId: string }
  | { name: "dev-track"; trackId: string };

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

export function App() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;

  const [bank, setBank] = useState<QuestionBank>(EMPTY_BANK);
  const [history, setHistory] = useState(() => loadHistory());
  const [inProgress, setInProgress] = useState<Record<string, InProgressSession>>({});
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
        const [nextBank, nextHistory, nextInProgress] = await Promise.all([
          loadBankAsync(),
          loadHistoryAsync(),
          loadInProgressSessions(),
        ]);
        if (cancelled) return;
        setBank(nextBank);
        setHistory(nextHistory);
        setInProgress(nextInProgress);
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

  const requestExitQuiz = useCallback(() => {
    if (!quizAttemptedRef.current) return true;
    // ordered 모드는 [이어 풀기]에 자동 저장되므로 confirm 생략
    if (route.name === "quiz" && route.mode === "ordered") {
      quizAttemptedRef.current = false;
      return true;
    }
    const ok = window.confirm("나가면 진행한 답변이 사라져요. 그만두시겠어요?");
    if (ok) quizAttemptedRef.current = false;
    return ok;
  }, [route]);

  const goHome = useCallback(() => {
    if (!requestExitQuiz()) return;
    setRoute({ name: "home" });
  }, [requestExitQuiz]);
  const goManage = useCallback(() => {
    if (!import.meta.env.DEV) return;
    if (!requestExitQuiz()) return;
    setRoute({ name: "manage" });
  }, [requestExitQuiz]);

  const goTrack = useCallback(
    (track: TrackMeta) => {
      if (!requestExitQuiz()) return;
      if (track.domain === "cert") {
        setRoute({ name: "cert", trackId: track.id });
      } else {
        setRoute({ name: "dev-track", trackId: track.id });
      }
    },
    [requestExitQuiz],
  );

  const goCategory = useCallback(
    (categoryId: string) => {
      if (!requestExitQuiz()) return;
      setRoute({ name: "dev-category", categoryId });
    },
    [requestExitQuiz],
  );

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
      let pool = scopedRounds.flatMap((r) => r.questions);
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

  const exitQuiz = useCallback(() => {
    if (!requestExitQuiz()) return;
    setRoute((prev) => (prev.name === "quiz" ? prev.origin : { name: "home" }));
  }, [requestExitQuiz]);

  const retry = useCallback(async () => {
    if (route.name !== "result") return;
    const sourceRound = bank.rounds.find((r) => r.id === route.result.roundId);
    if (sourceRound) {
      await startRound(sourceRound);
    } else {
      await startRandom();
    }
  }, [route, bank, startRound, startRandom]);

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
        <Topbar current="home" onHome={goHome} onManage={goManage} />
        <main>
          <div className="container">
            <div className="card empty">문제 데이터를 불러오는 중…</div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Topbar
        current={route.name === "manage" ? "manage" : "home"}
        onHome={goHome}
        onManage={goManage}
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
            />
          )}
          {route.name === "result" && (
            <Result result={route.result} onRetry={retry} onHome={goHome} />
          )}
          {route.name === "manage" && (
            <Manage
              bank={bank}
              onChange={updateBank}
              onReplace={replaceBank}
              onClose={goHome}
            />
          )}
        </div>
      </main>
    </div>
  );
}
