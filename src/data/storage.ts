import type {
  CategoryMeta,
  FavoriteEntry,
  FavoriteMap,
  InProgressSession,
  QuestionBank,
  Round,
  RoundBookmark,
  RoundBookmarkMap,
  RoundResult,
  ScoreHistory,
  SubjectMeta,
  TrackMeta,
} from "../types";
import { SEED_BANK } from "./seed";
import {
  bulkInsertAttempts,
  deleteUserBookmark,
  deleteUserFavorite,
  deleteUserFavorites,
  deleteUserInProgress,
  fetchAttempts,
  fetchLegacyHistoryImported,
  fetchUserBookmarks,
  fetchUserFavorites,
  fetchUserInProgress,
  fetchUserManifestOverlay,
  fetchUserRoundOverlays,
  insertAttempt,
  setLegacyHistoryImported,
  upsertUserBookmark,
  upsertUserFavorite,
  upsertUserFavorites,
  upsertUserInProgress,
  upsertUserManifestOverlay,
  upsertUserRoundOverlay,
  type UserManifestPatch,
} from "./cloud";

export const FAVORITE_POOL_PREFIX = "favorites:";
const FAVORITE_PREVIEW_PREFIX = "favorites-preview:";

function isVirtualFavoriteRoundId(id: string): boolean {
  return (
    id.startsWith(FAVORITE_POOL_PREFIX) ||
    id.startsWith(FAVORITE_PREVIEW_PREFIX)
  );
}

const HISTORY_KEY = "solve-card:history:v1";
const IN_PROGRESS_KEY = "solve-card:in-progress:v1";
const FAVORITES_KEY = "solve-card:favorites:v1";
const BOOKMARKS_KEY = "solve-card:bookmarks:v1";
const MANIFEST_KEY = "solve-card:manifest:v3";
const ROUND_KEY_PREFIX = "solve-card:round:v3:";
const USER_VERSION = "user-modified";
const SEED_VERSION = "seed";
const INDEX_URL = `${import.meta.env.BASE_URL}data/index.json`;
const roundUrl = (id: string) =>
  `${import.meta.env.BASE_URL}data/rounds/${id}.json`;

interface ManifestEntry {
  id: string;
  trackId?: string;
  category?: string;
  title: string;
  description?: string;
  questionCount: number;
  version?: string;
  date?: string;
}
interface Manifest {
  rounds: ManifestEntry[];
  tracks?: TrackMeta[];
  categories?: CategoryMeta[];
  subjects?: SubjectMeta[];
  updatedAt?: string;
}

interface CachedRound {
  round: Round;
  version: string;
}

const isBrowser = typeof window !== "undefined" && !!window.localStorage;

let currentManifest: Manifest | null = null;
let currentUserId: string | null = null;

/** Auth 컨텍스트 주입. App 레벨에서 user 변동 시 호출. */
export function setAuthUserId(id: string | null): void {
  currentUserId = id;
}

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
      trackId: entry.trackId,
      title: entry.title,
      description: entry.description,
      questions: [],
      questionCount: entry.questionCount,
      date: entry.date,
    })),
    tracks: manifest.tracks,
    categories: manifest.categories,
    subjects: manifest.subjects,
    updatedAt: manifest.updatedAt ?? "",
  };
}

function manifestFromBank(bank: QuestionBank, version: string): Manifest {
  return {
    rounds: bank.rounds.map((r) => ({
      id: r.id,
      trackId: r.trackId,
      title: r.title,
      description: r.description,
      questionCount: r.questionCount ?? r.questions.length,
      version,
      date: r.date,
    })),
    tracks: bank.tracks,
    categories: bank.categories,
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

/**
 * 시드 manifest를 가져온다 (원격 우선, 캐시·시드 폴백).
 * USER_VERSION 보호는 호출자(loadBankAsync)에서 게스트 모드일 때만 적용.
 */
async function loadSeedManifest(): Promise<Manifest> {
  const cached = readManifestCache();

  const remote = await fetchManifest();
  if (remote) {
    if (!cached || cached.updatedAt !== remote.updatedAt) {
      writeManifestCache(remote);
    }
    return remote;
  }

  if (cached) return cached;

  // 마지막 폴백: 내장 시드 — 회차 캐시까지 채워두면 ensureRound가 즉시 반환
  const seedManifest = manifestFromBank(SEED_BANK, SEED_VERSION);
  for (const round of SEED_BANK.rounds) {
    writeRoundCache(round.id, round, SEED_VERSION);
  }
  writeManifestCache(seedManifest);
  return seedManifest;
}

/**
 * 시드 manifest + 사용자 manifest overlay 를 id 기준으로 머지한다.
 * 충돌 시 사용자 항목 우선.
 */
function mergeManifest(base: Manifest, patch: UserManifestPatch | null): Manifest {
  if (!patch) return base;
  return {
    ...base,
    rounds: mergeById(base.rounds, (patch.rounds ?? []) as ManifestEntry[]),
    tracks: mergeById(base.tracks ?? [], patch.tracks ?? []),
    categories: mergeById(base.categories ?? [], patch.categories ?? []),
    subjects:
      patch.subjects && patch.subjects.length > 0
        ? patch.subjects
        : base.subjects,
    updatedAt: base.updatedAt,
  };
}

function mergeById<T extends { id?: string; key?: string }>(
  base: T[],
  patch: T[],
): T[] {
  const idOf = (x: T) => x.id ?? x.key ?? "";
  const map = new Map<string, T>();
  for (const x of base) map.set(idOf(x), x);
  for (const x of patch) map.set(idOf(x), x);
  return Array.from(map.values());
}

export async function loadBankAsync(): Promise<QuestionBank> {
  if (!isBrowser) return SEED_BANK;

  // 게스트: 기존 흐름 (USER_VERSION 편집본 보호)
  if (!currentUserId) {
    const cached = readManifestCache();
    if (cached && cached.updatedAt === USER_VERSION) {
      currentManifest = cached;
      return metaBankFromManifest(cached);
    }
    const seedManifest = await loadSeedManifest();
    currentManifest = seedManifest;
    return metaBankFromManifest(seedManifest);
  }

  // 로그인 사용자: 시드 + cloud overlay 머지
  const userId = currentUserId;
  const [seedManifest, userPatch, roundOverlays] = await Promise.all([
    loadSeedManifest(),
    fetchUserManifestOverlay(userId),
    fetchUserRoundOverlays(userId),
  ]);

  // 사용자 round overlay는 round 캐시에 USER_VERSION으로 박아둬서 ensureRound가 즉시 반환
  for (const [roundId, round] of roundOverlays) {
    writeRoundCache(roundId, round, USER_VERSION);
  }

  const merged = mergeManifest(seedManifest, userPatch);
  currentManifest = merged;
  return metaBankFromManifest(merged);
}

/** 회차 본문에 manifest 메타(trackId/date)를 머지한다. */
function mergeRoundMeta(round: Round, entry?: ManifestEntry): Round {
  if (!entry) return round;
  return {
    ...round,
    trackId: round.trackId ?? entry.trackId,
    date: round.date ?? entry.date,
  };
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
      return mergeRoundMeta(cached.round, entry);
    }
  }

  const remote = await fetchRound(id);
  if (remote) {
    writeRoundCache(id, remote, expectedVersion || "");
    return mergeRoundMeta(remote, entry);
  }
  return cached?.round ? mergeRoundMeta(cached.round, entry) : null;
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
          trackId: entry.trackId,
          title: entry.title,
          description: entry.description,
          questions: [],
          questionCount: entry.questionCount,
          date: entry.date,
        } as Round)
      );
    }),
  );
  return {
    rounds,
    tracks: meta.tracks,
    categories: meta.categories,
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
      trackId: r.trackId,
      title: r.title,
      description: r.description,
      questionCount: r.questionCount ?? r.questions.length,
      version: USER_VERSION,
      date: r.date,
    })),
    tracks: bank.tracks,
    categories: bank.categories,
    subjects: bank.subjects,
    updatedAt: USER_VERSION,
  };
  writeManifestCache(manifest);
  currentManifest = manifest;

  // 로그인 사용자: cloud에도 동기화 (fire-and-forget)
  if (currentUserId) {
    void syncBankToCloud(currentUserId, bank);
  }
}

async function syncBankToCloud(
  userId: string,
  bank: QuestionBank,
): Promise<void> {
  await Promise.all(
    bank.rounds.map((r) => upsertUserRoundOverlay(userId, r)),
  );
  const patch: UserManifestPatch = {
    rounds: bank.rounds.map((r) => ({
      id: r.id,
      trackId: r.trackId,
      title: r.title,
      description: r.description,
      questionCount: r.questionCount ?? r.questions.length,
      date: r.date,
    })),
    tracks: bank.tracks,
    categories: bank.categories,
    subjects: bank.subjects,
  };
  await upsertUserManifestOverlay(userId, patch);
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

/** 로그인이면 cloud에서 회차별 최근 20개로 잘라 반환, 게스트는 localStorage. */
export async function loadHistoryAsync(): Promise<ScoreHistory> {
  if (!isBrowser) return {};
  if (!currentUserId) return loadHistory();
  const cloud = await fetchAttempts(currentUserId);
  const trimmed: ScoreHistory = {};
  for (const [rid, list] of Object.entries(cloud)) {
    trimmed[rid] = list.slice(0, 20);
  }
  return trimmed;
}

/**
 * 최초 로그인 시 1회: localStorage history → round_attempts 일괄 업로드.
 * user_flags.legacy_history_imported 가 true면 즉시 반환.
 */
export async function migrateLegacyHistoryIfNeeded(
  userId: string,
): Promise<void> {
  const already = await fetchLegacyHistoryImported(userId);
  if (already) return;
  const local = loadHistory();
  const all = Object.values(local).flat();
  if (all.length > 0) {
    await bulkInsertAttempts(userId, all);
  }
  await setLegacyHistoryImported(userId);
}

export function appendResult(result: RoundResult): ScoreHistory {
  // 즐겨찾기 모아풀기/미리보기는 일회성 — 히스토리에 남기지 않는다.
  if (isVirtualFavoriteRoundId(result.roundId)) {
    return loadHistory();
  }
  const history = loadHistory();
  const list = history[result.roundId] ?? [];
  const next: ScoreHistory = {
    ...history,
    [result.roundId]: [result, ...list].slice(0, 20),
  };
  if (isBrowser) localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  // 로그인 시 cloud에도 저장. 실패해도 localStorage는 유효.
  if (currentUserId) {
    void insertAttempt(currentUserId, result);
  }
  return next;
}

export function clearHistory(): void {
  if (isBrowser) localStorage.removeItem(HISTORY_KEY);
}

/* ──────────────── in-progress sessions ──────────────── */

type InProgressMap = Record<string, InProgressSession>;

function readInProgressLocal(): InProgressMap {
  if (!isBrowser) return {};
  return safeParse<InProgressMap>(localStorage.getItem(IN_PROGRESS_KEY)) ?? {};
}

function writeInProgressLocal(map: InProgressMap): void {
  if (!isBrowser) return;
  localStorage.setItem(IN_PROGRESS_KEY, JSON.stringify(map));
}

/** 게스트는 localStorage, 로그인은 cloud + localStorage 머지(cloud 우선). */
export async function loadInProgressSessions(): Promise<InProgressMap> {
  if (!isBrowser) return {};
  if (!currentUserId) return readInProgressLocal();
  const cloud = await fetchUserInProgress(currentUserId);
  // localStorage 캐시 갱신 (read-through)
  writeInProgressLocal(cloud);
  return cloud;
}

export function saveInProgressSession(session: InProgressSession): void {
  if (!isBrowser) return;
  // 즐겨찾기 모아풀기/미리보기 가상 round는 이어풀기 대상에서 제외
  if (isVirtualFavoriteRoundId(session.roundId)) return;
  const map = readInProgressLocal();
  map[session.roundId] = session;
  writeInProgressLocal(map);
  if (currentUserId) {
    void upsertUserInProgress(currentUserId, session);
  }
}

export function clearInProgressSession(roundId: string): void {
  if (!isBrowser) return;
  if (isVirtualFavoriteRoundId(roundId)) return;
  const map = readInProgressLocal();
  if (roundId in map) {
    delete map[roundId];
    writeInProgressLocal(map);
  }
  if (currentUserId) {
    void deleteUserInProgress(currentUserId, roundId);
  }
}

/* ──────────────── favorites & bookmarks ──────────────── */

function readFavoritesLocal(): FavoriteMap {
  if (!isBrowser) return {};
  return safeParse<FavoriteMap>(localStorage.getItem(FAVORITES_KEY)) ?? {};
}

function writeFavoritesLocal(map: FavoriteMap): void {
  if (!isBrowser) return;
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(map));
}

function readBookmarksLocal(): RoundBookmarkMap {
  if (!isBrowser) return {};
  return safeParse<RoundBookmarkMap>(localStorage.getItem(BOOKMARKS_KEY)) ?? {};
}

function writeBookmarksLocal(map: RoundBookmarkMap): void {
  if (!isBrowser) return;
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(map));
}

export async function loadFavorites(): Promise<FavoriteMap> {
  if (!isBrowser) return {};
  if (!currentUserId) return readFavoritesLocal();
  const cloud = await fetchUserFavorites(currentUserId);
  writeFavoritesLocal(cloud);
  return cloud;
}

export async function loadBookmarks(): Promise<RoundBookmarkMap> {
  if (!isBrowser) return {};
  if (!currentUserId) return readBookmarksLocal();
  const cloud = await fetchUserBookmarks(currentUserId);
  writeBookmarksLocal(cloud);
  return cloud;
}

export function addFavorite(entry: FavoriteEntry): FavoriteMap {
  const map = readFavoritesLocal();
  map[entry.questionId] = entry;
  writeFavoritesLocal(map);
  if (currentUserId) {
    void upsertUserFavorite(currentUserId, entry);
  }
  return map;
}

export function removeFavorite(questionId: string): FavoriteMap {
  const map = readFavoritesLocal();
  if (questionId in map) {
    delete map[questionId];
    writeFavoritesLocal(map);
  }
  if (currentUserId) {
    void deleteUserFavorite(currentUserId, questionId);
  }
  return map;
}

export function addFavoritesBulk(entries: FavoriteEntry[]): FavoriteMap {
  if (entries.length === 0) return readFavoritesLocal();
  const map = readFavoritesLocal();
  const added: FavoriteEntry[] = [];
  for (const entry of entries) {
    if (!(entry.questionId in map)) {
      map[entry.questionId] = entry;
      added.push(entry);
    }
  }
  if (added.length > 0) writeFavoritesLocal(map);
  if (currentUserId && added.length > 0) {
    void upsertUserFavorites(currentUserId, added);
  }
  return map;
}

export function removeFavoritesBulk(questionIds: string[]): FavoriteMap {
  if (questionIds.length === 0) return readFavoritesLocal();
  const map = readFavoritesLocal();
  let mutated = false;
  for (const id of questionIds) {
    if (id in map) {
      delete map[id];
      mutated = true;
    }
  }
  if (mutated) writeFavoritesLocal(map);
  if (currentUserId) {
    void deleteUserFavorites(currentUserId, questionIds);
  }
  return map;
}

export function addBookmark(roundId: string): RoundBookmarkMap {
  const map = readBookmarksLocal();
  const entry: RoundBookmark = { roundId, addedAt: new Date().toISOString() };
  map[roundId] = entry;
  writeBookmarksLocal(map);
  if (currentUserId) {
    void upsertUserBookmark(currentUserId, entry);
  }
  return map;
}

export function removeBookmark(roundId: string): RoundBookmarkMap {
  const map = readBookmarksLocal();
  if (roundId in map) {
    delete map[roundId];
    writeBookmarksLocal(map);
  }
  if (currentUserId) {
    void deleteUserBookmark(currentUserId, roundId);
  }
  return map;
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
