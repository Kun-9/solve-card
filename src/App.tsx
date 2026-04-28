import { useCallback, useEffect, useMemo, useState } from "react";
import type { QuestionBank, Round, RoundResult } from "./types";
import { appendResult, loadBankAsync, loadHistory, saveBank } from "./data/storage";
import { Home } from "./components/Home";
import { Quiz } from "./components/Quiz";
import { Result } from "./components/Result";
import { Manage } from "./components/Manage";
import { Topbar } from "./components/Topbar";
import { shuffle } from "./lib/utils";

type Route =
  | { name: "home" }
  | { name: "quiz"; round: Round; mode: "ordered" | "random"; sourceLabel: string }
  | { name: "result"; result: RoundResult }
  | { name: "manage" };

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

  const goHome = useCallback(() => setRoute({ name: "home" }), []);
  const goManage = useCallback(() => {
    if (!import.meta.env.DEV) return;
    setRoute({ name: "manage" });
  }, []);

  const startRound = useCallback((round: Round) => {
    if (round.questions.length === 0) return;
    setRoute({
      name: "quiz",
      round,
      mode: "ordered",
      sourceLabel: round.title,
    });
  }, []);

  const startRandom = useCallback(
    (subjectKey?: string) => {
      const all = bank.rounds.flatMap((r) => r.questions);
      const pool = subjectKey
        ? all.filter((q) => q.section?.startsWith(subjectKey))
        : all;
      if (pool.length === 0) return;
      const picked = shuffle(pool).slice(
        0,
        Math.min(RANDOM_POOL_SIZE, pool.length),
      );
      const label = subjectKey ? `${subjectKey} 랜덤` : "전체 랜덤";
      const round: Round = {
        id: `random-${subjectKey ?? "all"}-${Date.now()}`,
        title: label,
        description: `${pool.length}문제 중 ${picked.length}문제를 무작위로 출제합니다.`,
        questions: picked,
      };
      setRoute({ name: "quiz", round, mode: "random", sourceLabel: label });
    },
    [bank],
  );

  const finishQuiz = useCallback((result: RoundResult) => {
    const next = appendResult(result);
    setHistory(next);
    setRoute({ name: "result", result });
  }, []);

  const retry = useCallback(() => {
    if (route.name !== "result") return;
    const sourceRound = bank.rounds.find((r) => r.id === route.result.roundId);
    if (sourceRound) {
      startRound(sourceRound);
    } else {
      startRandom();
    }
  }, [route, bank, startRound, startRandom]);

  const totalQuestions = useMemo(
    () => bank.rounds.reduce((sum, r) => sum + r.questions.length, 0),
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
            <Home
              bank={bank}
              history={history}
              totalQuestions={totalQuestions}
              onStartRound={startRound}
              onStartRandom={startRandom}
              onManage={goManage}
            />
          )}
          {route.name === "quiz" && (
            <Quiz
              round={route.round}
              mode={route.mode}
              sourceLabel={route.sourceLabel}
              onFinish={finishQuiz}
              onExit={goHome}
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
