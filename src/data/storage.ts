import type { QuestionBank, RoundResult, ScoreHistory } from "../types";
import { SEED_BANK } from "./seed";

const BANK_KEY = "solve-card:bank:v1";
const HISTORY_KEY = "solve-card:history:v1";
const REMOTE_VERSION_KEY = "solve-card:bank:remoteVersion";
const REMOTE_URL = `${import.meta.env.BASE_URL}data/cbt.json`;

const isBrowser = typeof window !== "undefined" && !!window.localStorage;

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readStoredBank(): QuestionBank | null {
  if (!isBrowser) return null;
  const stored = safeParse<QuestionBank>(localStorage.getItem(BANK_KEY));
  if (stored && Array.isArray(stored.rounds)) return stored;
  return null;
}

export async function loadBankAsync(): Promise<QuestionBank> {
  if (!isBrowser) return SEED_BANK;

  const stored = readStoredBank();
  const storedRemoteVersion = localStorage.getItem(REMOTE_VERSION_KEY);

  try {
    const res = await fetch(REMOTE_URL, { cache: "no-store" });
    if (res.ok) {
      const remote = (await res.json()) as QuestionBank;
      if (remote && Array.isArray(remote.rounds) && remote.rounds.length > 0) {
        const remoteVersion = remote.updatedAt ?? "";
        if (!stored || storedRemoteVersion !== remoteVersion) {
          localStorage.setItem(BANK_KEY, JSON.stringify(remote));
          localStorage.setItem(REMOTE_VERSION_KEY, remoteVersion);
          return remote;
        }
        return stored;
      }
    }
  } catch {
    // 오프라인 또는 fetch 실패 — 폴백
  }

  if (stored) return stored;

  // 마지막 폴백: 내장 시드
  localStorage.setItem(BANK_KEY, JSON.stringify(SEED_BANK));
  return SEED_BANK;
}

export function saveBank(bank: QuestionBank): void {
  if (!isBrowser) return;
  const next: QuestionBank = { ...bank, updatedAt: new Date().toISOString() };
  localStorage.setItem(BANK_KEY, JSON.stringify(next));
  // 사용자가 직접 수정한 이후엔 원격 버전 동기화를 멈춥니다.
  localStorage.setItem(REMOTE_VERSION_KEY, "user-modified");
}

export interface SaveToFileResult {
  ok: boolean;
  error?: string;
}

/**
 * dev 서버 한정: public/data/cbt.json 파일을 직접 갱신한다.
 * prod 빌드에선 동작하지 않는다.
 */
export async function saveBankToFile(
  bank: QuestionBank,
): Promise<SaveToFileResult> {
  if (!isBrowser) return { ok: false, error: "browser only" };
  if (!import.meta.env.DEV) {
    return { ok: false, error: "dev 서버에서만 동작합니다" };
  }
  try {
    const next: QuestionBank = { ...bank, updatedAt: new Date().toISOString() };
    const res = await fetch("/__save-bank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };
    if (!res.ok || !body.ok) {
      return { ok: false, error: body.error ?? `HTTP ${res.status}` };
    }
    // 원격 캐시(BASE_URL/data/cbt.json) 헬퍼와 충돌하지 않도록 표시 갱신
    if (next.updatedAt) {
      localStorage.setItem(REMOTE_VERSION_KEY, next.updatedAt);
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "네트워크 오류",
    };
  }
}

export async function resyncRemoteBank(): Promise<QuestionBank> {
  if (isBrowser) {
    localStorage.removeItem(BANK_KEY);
    localStorage.removeItem(REMOTE_VERSION_KEY);
  }
  return loadBankAsync();
}

export function resetToSeed(): QuestionBank {
  if (isBrowser) {
    localStorage.setItem(BANK_KEY, JSON.stringify(SEED_BANK));
    localStorage.setItem(REMOTE_VERSION_KEY, "user-modified");
  }
  return SEED_BANK;
}

export function loadHistory(): ScoreHistory {
  if (!isBrowser) return {};
  return safeParse<ScoreHistory>(localStorage.getItem(HISTORY_KEY)) ?? {};
}

export function appendResult(result: RoundResult): ScoreHistory {
  const history = loadHistory();
  const list = history[result.roundId] ?? [];
  const next: ScoreHistory = {
    ...history,
    [result.roundId]: [result, ...list].slice(0, 20),
  };
  if (isBrowser) localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

export function clearHistory(): void {
  if (isBrowser) localStorage.removeItem(HISTORY_KEY);
}

export function exportBankToFile(bank: QuestionBank, filename = "questions.json"): void {
  if (!isBrowser) return;
  const blob = new Blob([JSON.stringify(bank, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importBankFromFile(file: File): Promise<QuestionBank> {
  const text = await file.text();
  const parsed = JSON.parse(text) as QuestionBank;
  if (!parsed || !Array.isArray(parsed.rounds)) {
    throw new Error("올바른 questions.json 형식이 아닙니다.");
  }
  return parsed;
}
