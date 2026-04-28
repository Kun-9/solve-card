import type {
  QuestionBank,
  Round,
  RoundResult,
  ScoreHistory,
  SubjectMeta,
} from "../types";
import { SEED_BANK } from "./seed";

const HISTORY_KEY = "solve-card:history:v1";
const MANIFEST_KEY = "solve-card:manifest:v3";
const ROUND_KEY_PREFIX = "solve-card:round:v3:";
const USER_VERSION = "user-modified";
const SEED_VERSION = "seed";
const INDEX_URL = `${import.meta.env.BASE_URL}data/index.json`;
const roundUrl = (id: string) =>
  `${import.meta.env.BASE_URL}data/rounds/${id}.json`;

interface ManifestEntry {
  id: string;
  category?: string;
  title: string;
  description?: string;
  questionCount: number;
  version?: string;
}
interface Manifest {
  rounds: ManifestEntry[];
  subjects?: SubjectMeta[];
  updatedAt?: string;
}

interface CachedRound {
  round: Round;
  version: string;
}

const isBrowser = typeof window !== "undefined" && !!window.localStorage;

let currentManifest: Manifest | null = null;

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readManifestCache(): Manifest | null {
  if (!isBrowser) return null;
  return safeParse<Manifest>(localStorage.getItem(MANIFEST_KEY));
}

function writeManifestCache(manifest: Manifest): void {
  if (!isBrowser) return;
  localStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest));
}

function clearAllRoundCaches(): void {
  if (!isBrowser) return;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith(ROUND_KEY_PREFIX)) keys.push(key);
  }
  keys.forEach((k) => localStorage.removeItem(k));
}

function readRoundCache(id: string): CachedRound | null {
  if (!isBrowser) return null;
  return safeParse<CachedRound>(
    localStorage.getItem(`${ROUND_KEY_PREFIX}${id}`),
  );
}

function writeRoundCache(id: string, round: Round, version: string): void {
  if (!isBrowser) return;
  localStorage.setItem(
    `${ROUND_KEY_PREFIX}${id}`,
    JSON.stringify({ round, version }),
  );
}

function metaBankFromManifest(manifest: Manifest): QuestionBank {
  return {
    rounds: manifest.rounds.map((entry) => ({
      id: entry.id,
      title: entry.title,
      description: entry.description,
      questions: [],
      questionCount: entry.questionCount,
    })),
    subjects: manifest.subjects,
    updatedAt: manifest.updatedAt ?? "",
  };
}

function manifestFromBank(bank: QuestionBank, version: string): Manifest {
  return {
    rounds: bank.rounds.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      questionCount: r.questionCount ?? r.questions.length,
      version,
    })),
    subjects: bank.subjects,
    updatedAt: bank.updatedAt || version,
  };
}

async function fetchManifest(): Promise<Manifest | null> {
  try {
    const res = await fetch(INDEX_URL, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as Manifest;
    if (!data || !Array.isArray(data.rounds)) return null;
    return data;
  } catch {
    return null;
  }
}

async function fetchRound(id: string): Promise<Round | null> {
  try {
    const res = await fetch(roundUrl(id), { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Round;
  } catch {
    return null;
  }
}

export async function loadBankAsync(): Promise<QuestionBank> {
  if (!isBrowser) return SEED_BANK;

  const cached = readManifestCache();

  // 사용자가 직접 편집한 manifest는 원격으로 덮지 않음
  if (cached && cached.updatedAt === USER_VERSION) {
    currentManifest = cached;
    return metaBankFromManifest(cached);
  }

  const remote = await fetchManifest();
  if (remote) {
    if (!cached || cached.updatedAt !== remote.updatedAt) {
      writeManifestCache(remote);
    }
    currentManifest = remote;
    return metaBankFromManifest(remote);
  }

  if (cached) {
    currentManifest = cached;
    return metaBankFromManifest(cached);
  }

  // 마지막 폴백: 내장 시드 — 회차 캐시까지 채워두면 ensureRound가 즉시 반환
  const seedManifest = manifestFromBank(SEED_BANK, SEED_VERSION);
  for (const round of SEED_BANK.rounds) {
    writeRoundCache(round.id, round, SEED_VERSION);
  }
  writeManifestCache(seedManifest);
  currentManifest = seedManifest;
  return metaBankFromManifest(seedManifest);
}

export async function ensureRound(id: string): Promise<Round | null> {
  if (!isBrowser) {
    return SEED_BANK.rounds.find((r) => r.id === id) ?? null;
  }
  const entry = currentManifest?.rounds.find((r) => r.id === id);
  const expectedVersion = entry?.version ?? "";

  const cached = readRoundCache(id);
  if (cached && cached.round) {
    // 사용자 편집본이거나 버전 일치 시 캐시 사용
    if (
      cached.version === USER_VERSION ||
      !expectedVersion ||
      cached.version === expectedVersion
    ) {
      return cached.round;
    }
  }

  const remote = await fetchRound(id);
  if (remote) {
    writeRoundCache(id, remote, expectedVersion || "");
    return remote;
  }
  return cached?.round ?? null;
}

export async function ensureAllRounds(): Promise<QuestionBank> {
  if (!isBrowser) return SEED_BANK;
  if (!currentManifest) {
    await loadBankAsync();
  }
  const meta = currentManifest;
  if (!meta) return SEED_BANK;

  const rounds = await Promise.all(
    meta.rounds.map(async (entry) => {
      const r = await ensureRound(entry.id);
      return (
        r ??
        ({
          id: entry.id,
          title: entry.title,
          description: entry.description,
          questions: [],
          questionCount: entry.questionCount,
        } as Round)
      );
    }),
  );
  return {
    rounds,
    subjects: meta.subjects,
    updatedAt: meta.updatedAt ?? "",
  };
}

export function saveBank(bank: QuestionBank): void {
  if (!isBrowser) return;
  for (const round of bank.rounds) {
    writeRoundCache(round.id, round, USER_VERSION);
  }
  const manifest: Manifest = {
    rounds: bank.rounds.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      questionCount: r.questionCount ?? r.questions.length,
      version: USER_VERSION,
    })),
    subjects: bank.subjects,
    updatedAt: USER_VERSION,
  };
  writeManifestCache(manifest);
  currentManifest = manifest;
}

export interface SaveToFileResult {
  ok: boolean;
  error?: string;
}

/**
 * dev 서버 한정: public/data/index.json + public/data/rounds/*.json을 직접 갱신한다.
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
    localStorage.removeItem(MANIFEST_KEY);
    clearAllRoundCaches();
    currentManifest = null;
  }
  return loadBankAsync();
}

export function resetToSeed(): QuestionBank {
  if (isBrowser) {
    clearAllRoundCaches();
    for (const round of SEED_BANK.rounds) {
      writeRoundCache(round.id, round, SEED_VERSION);
    }
    const manifest = manifestFromBank(SEED_BANK, SEED_VERSION);
    manifest.updatedAt = USER_VERSION;
    writeManifestCache(manifest);
    currentManifest = manifest;
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
