import type {
  CategoryMeta,
  FavoriteEntry,
  FavoriteMap,
  InProgressSession,
  Round,
  RoundBookmark,
  RoundBookmarkMap,
  RoundResult,
  ScoreHistory,
  SubjectMeta,
  TrackMeta,
} from "../types";
import { supabase } from "../lib/supabase";

export interface UserManifestPatch {
  rounds?: Array<{
    id: string;
    trackId?: string;
    title: string;
    description?: string;
    questionCount: number;
    date?: string;
  }>;
  tracks?: TrackMeta[];
  categories?: CategoryMeta[];
  subjects?: SubjectMeta[];
}

export async function fetchUserManifestOverlay(
  userId: string,
): Promise<UserManifestPatch | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("user_manifest_overlays")
    .select("manifest")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data.manifest as UserManifestPatch;
}

export async function upsertUserManifestOverlay(
  userId: string,
  manifest: UserManifestPatch,
): Promise<void> {
  if (!supabase) return;
  await supabase.from("user_manifest_overlays").upsert({
    user_id: userId,
    manifest,
    updated_at: new Date().toISOString(),
  });
}

export async function fetchUserRoundOverlays(
  userId: string,
): Promise<Map<string, Round>> {
  const out = new Map<string, Round>();
  if (!supabase) return out;
  const { data, error } = await supabase
    .from("user_round_overlays")
    .select("round_id, round")
    .eq("user_id", userId);
  if (error || !data) return out;
  for (const row of data) {
    out.set(row.round_id as string, row.round as Round);
  }
  return out;
}

export async function fetchUserRoundOverlay(
  userId: string,
  roundId: string,
): Promise<Round | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("user_round_overlays")
    .select("round")
    .eq("user_id", userId)
    .eq("round_id", roundId)
    .maybeSingle();
  if (error || !data) return null;
  return data.round as Round;
}

export async function upsertUserRoundOverlay(
  userId: string,
  round: Round,
): Promise<void> {
  if (!supabase) return;
  await supabase.from("user_round_overlays").upsert({
    user_id: userId,
    round_id: round.id,
    round,
    updated_at: new Date().toISOString(),
  });
}

export async function deleteUserRoundOverlay(
  userId: string,
  roundId: string,
): Promise<void> {
  if (!supabase) return;
  await supabase
    .from("user_round_overlays")
    .delete()
    .eq("user_id", userId)
    .eq("round_id", roundId);
}

/* ──────────────── round_attempts ──────────────── */

/**
 * RoundResult.logs → questionId → selectedIndex 맵으로 압축.
 * 미선택(-1)은 제외.
 */
function selectionsFromResult(result: RoundResult): Record<string, number> {
  const out: Record<string, number> = {};
  for (const log of result.logs) {
    if (log.selectedIndex >= 0) out[log.questionId] = log.selectedIndex;
  }
  return out;
}

export async function fetchAttempts(userId: string): Promise<ScoreHistory> {
  const out: ScoreHistory = {};
  if (!supabase) return out;
  const { data, error } = await supabase
    .from("round_attempts")
    .select("round_id, score, total, finished_at")
    .eq("user_id", userId)
    .order("finished_at", { ascending: false });
  if (error || !data) return out;
  for (const row of data) {
    const roundId = row.round_id as string;
    const result: RoundResult = {
      roundId,
      roundTitle: "",
      total: row.total as number,
      correct: row.score as number,
      finishedAt: row.finished_at as string,
      durationMs: 0,
      logs: [],
      mode: "ordered",
    };
    const list = out[roundId] ?? [];
    list.push(result);
    out[roundId] = list;
  }
  return out;
}

export async function insertAttempt(
  userId: string,
  result: RoundResult,
): Promise<void> {
  if (!supabase) return;
  await supabase.from("round_attempts").insert({
    user_id: userId,
    round_id: result.roundId,
    score: result.correct,
    total: result.total,
    selections: selectionsFromResult(result),
    finished_at: result.finishedAt,
  });
}

export async function bulkInsertAttempts(
  userId: string,
  results: RoundResult[],
): Promise<void> {
  if (!supabase || results.length === 0) return;
  const rows = results.map((r) => ({
    user_id: userId,
    round_id: r.roundId,
    score: r.correct,
    total: r.total,
    selections: selectionsFromResult(r),
    finished_at: r.finishedAt,
  }));
  await supabase.from("round_attempts").insert(rows);
}

/* ──────────────── user_flags ──────────────── */

export async function fetchLegacyHistoryImported(
  userId: string,
): Promise<boolean> {
  if (!supabase) return true;
  const { data, error } = await supabase
    .from("user_flags")
    .select("legacy_history_imported")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return false;
  return Boolean(data?.legacy_history_imported);
}

export async function setLegacyHistoryImported(userId: string): Promise<void> {
  if (!supabase) return;
  await supabase.from("user_flags").upsert({
    user_id: userId,
    legacy_history_imported: true,
    updated_at: new Date().toISOString(),
  });
}

/* ──────────────── user_in_progress ──────────────── */

export async function fetchUserInProgress(
  userId: string,
): Promise<Record<string, InProgressSession>> {
  const out: Record<string, InProgressSession> = {};
  if (!supabase) return out;
  const { data, error } = await supabase
    .from("user_in_progress")
    .select("round_id, session")
    .eq("user_id", userId);
  if (error || !data) return out;
  for (const row of data) {
    out[row.round_id as string] = row.session as InProgressSession;
  }
  return out;
}

export async function upsertUserInProgress(
  userId: string,
  session: InProgressSession,
): Promise<void> {
  if (!supabase) return;
  await supabase.from("user_in_progress").upsert({
    user_id: userId,
    round_id: session.roundId,
    session,
    updated_at: new Date().toISOString(),
  });
}

export async function deleteUserInProgress(
  userId: string,
  roundId: string,
): Promise<void> {
  if (!supabase) return;
  await supabase
    .from("user_in_progress")
    .delete()
    .eq("user_id", userId)
    .eq("round_id", roundId);
}

/* ──────────────── user_question_favorites ──────────────── */

export async function fetchUserFavorites(userId: string): Promise<FavoriteMap> {
  const out: FavoriteMap = {};
  if (!supabase) return out;
  const { data, error } = await supabase
    .from("user_question_favorites")
    .select("question_id, round_id, track_id, added_at")
    .eq("user_id", userId);
  if (error || !data) return out;
  for (const row of data) {
    out[row.question_id as string] = {
      questionId: row.question_id as string,
      roundId: row.round_id as string,
      trackId: (row.track_id as string | null) ?? undefined,
      addedAt: row.added_at as string,
    };
  }
  return out;
}

export async function upsertUserFavorite(
  userId: string,
  entry: FavoriteEntry,
): Promise<void> {
  if (!supabase) return;
  await supabase.from("user_question_favorites").upsert({
    user_id: userId,
    question_id: entry.questionId,
    round_id: entry.roundId,
    track_id: entry.trackId ?? null,
    added_at: entry.addedAt,
  });
}

export async function deleteUserFavorite(
  userId: string,
  questionId: string,
): Promise<void> {
  if (!supabase) return;
  await supabase
    .from("user_question_favorites")
    .delete()
    .eq("user_id", userId)
    .eq("question_id", questionId);
}

export async function deleteUserFavorites(
  userId: string,
  questionIds: string[],
): Promise<void> {
  if (!supabase || questionIds.length === 0) return;
  await supabase
    .from("user_question_favorites")
    .delete()
    .eq("user_id", userId)
    .in("question_id", questionIds);
}

/* ──────────────── user_round_bookmarks ──────────────── */

export async function fetchUserBookmarks(
  userId: string,
): Promise<RoundBookmarkMap> {
  const out: RoundBookmarkMap = {};
  if (!supabase) return out;
  const { data, error } = await supabase
    .from("user_round_bookmarks")
    .select("round_id, added_at")
    .eq("user_id", userId);
  if (error || !data) return out;
  for (const row of data) {
    out[row.round_id as string] = {
      roundId: row.round_id as string,
      addedAt: row.added_at as string,
    };
  }
  return out;
}

export async function upsertUserBookmark(
  userId: string,
  bookmark: RoundBookmark,
): Promise<void> {
  if (!supabase) return;
  await supabase.from("user_round_bookmarks").upsert({
    user_id: userId,
    round_id: bookmark.roundId,
    added_at: bookmark.addedAt,
  });
}

export async function deleteUserBookmark(
  userId: string,
  roundId: string,
): Promise<void> {
  if (!supabase) return;
  await supabase
    .from("user_round_bookmarks")
    .delete()
    .eq("user_id", userId)
    .eq("round_id", roundId);
}
