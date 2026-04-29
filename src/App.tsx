import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { QuestionBank, Round, RoundResult, TrackMeta } from "./types";
import {
  appendResult,
  ensureAllRounds,
  ensureRound,
  loadBankAsync,
  loadHistory,
  saveBank,
} from "./data/storage";
import { HomeHub } from "./components/HomeHub";
import { CertTrackScreen } from "./components/CertTrackScreen";
import { Quiz } from "./components/Quiz";
import { Result } from "./components/Result";
import { Manage } from "./components/Manage";
import { Topbar } from "./components/Topbar";
import { shuffle } from "./lib/utils";

type EntryRoute = { name: "home" } | { name: "cert"; trackId: string };
type Route =
  | EntryRoute
  | {
      name: "quiz";
      round: Round;
      mode: "ordered" | "random";
      sourceLabel: string;
      origin: EntryRoute;
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
  const [bank, setBank] = useState<QuestionBank>(EMPTY_BANK);
  const [history, setHistory] = useState(() => loadHistory());
  const [route, setRoute] = useState<Route>({ name: "home" });
  const [bootState, setBootState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    loadBankAsync()
      .then((next) => {
        if (cancelled) return;
        setBank(next);
        setBootState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setBootState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
    const ok = window.confirm("나가면 진행한 답변이 사라져요. 그만두시겠어요?");
    if (ok) quizAttemptedRef.current = false;
    return ok;
  }, []);

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
      if (track.domain !== "cert") return; // Dev 트랙은 Phase 2 에서 라우팅 추가
      if (!requestExitQuiz()) return;
      setRoute({ name: "cert", trackId: track.id });
    },
    [requestExitQuiz],
  );

  const startRound = useCallback(async (meta: Round, shuffled = false) => {
    const full = await ensureRound(meta.id);
    if (!full || full.questions.length === 0) return;
    const questions = shuffled ? shuffle(full.questions) : full.questions;
    setRoute((prev) => ({
      name: "quiz",
      round: { ...full, questions },
      mode: shuffled ? "random" : "ordered",
      sourceLabel: shuffled ? `${full.title} · 셔플` : full.title,
      origin: originOf(prev),
    }));
  }, []);

  const startRandom = useCallback(
    async (subjectKey?: string, trackId?: string) => {
      const full = await ensureAllRounds();
      const scopedRounds = trackId
        ? full.rounds.filter((r) => r.trackId === trackId)
        : full.rounds;
      const all = scopedRounds.flatMap((r) => r.questions);
      const pool = subjectKey
        ? all.filter((q) => q.section?.startsWith(subjectKey))
        : all;
      if (pool.length === 0) return;
      const picked = shuffle(pool).slice(
        0,
        Math.min(RANDOM_POOL_SIZE, pool.length),
      );
      const trackTitle = trackId
        ? (full.tracks?.find((t) => t.id === trackId)?.title ?? trackId)
        : null;
      const subjectPart = subjectKey ?? "전체";
      const label = trackTitle
        ? `${trackTitle} · ${subjectPart} 랜덤`
        : `${subjectPart} 랜덤`;
      const round: Round = {
        id: `random-${trackId ?? "all"}-${subjectKey ?? "all"}-${Date.now()}`,
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
      }));
    },
    [],
  );

  const finishQuiz = useCallback((result: RoundResult) => {
    const next = appendResult(result);
    setHistory(next);
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
              onManage={goManage}
            />
          )}
          {route.name === "cert" && (
            <CertTrackScreen
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
          {route.name === "quiz" && (
            <Quiz
              round={route.round}
              mode={route.mode}
              sourceLabel={route.sourceLabel}
              onFinish={finishQuiz}
              onExit={exitQuiz}
              onAttemptedChange={handleQuizAttemptedChange}
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
