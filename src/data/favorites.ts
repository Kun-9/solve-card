import type {
  Difficulty,
  FavoriteEntry,
  FavoriteMap,
  Question,
  Round,
} from "../types";
import { shuffle } from "../lib/utils";
import { ensureRound } from "./storage";

export const FAVORITE_POOL_PREFIX = "favorites:";
export const FAVORITE_PREVIEW_PREFIX = "favorites-preview:";

export function isVirtualFavoriteRoundId(id: string): boolean {
  return (
    id.startsWith(FAVORITE_POOL_PREFIX) ||
    id.startsWith(FAVORITE_PREVIEW_PREFIX)
  );
}

/** 즐겨찾기 풀에서 한 문제. round 컨텍스트와 함께 들고 있어 트랙별 그룹핑이 가능. */
export interface ResolvedFavorite {
  entry: FavoriteEntry;
  question: Question;
  roundTitle: string;
}

export interface FavoriteGroup {
  trackId: string | null; // null = 미분류 (cert)
  trackTitle: string;
  count: number;
  resolved: ResolvedFavorite[];
}

export interface FavoritePoolSpec {
  trackId: string | null;
  trackTitle: string;
  sectionKeys: string[]; // 빈 배열 = 전체
  difficulties: Difficulty[]; // 빈 배열 = 전체
  count: number;
}

const UNCATEGORIZED_KEY = "__uncategorized__";

/**
 * favorites 맵에 들어있는 모든 questionId를 round별로 모아 본문을 lookup한다.
 * 어떤 회차가 더 이상 존재하지 않거나 questionId가 사라졌으면 그 항목은 조용히 스킵.
 */
export async function resolveFavorites(
  favorites: FavoriteMap,
): Promise<ResolvedFavorite[]> {
  const entries = Object.values(favorites);
  if (entries.length === 0) return [];

  const byRound = new Map<string, FavoriteEntry[]>();
  for (const entry of entries) {
    const list = byRound.get(entry.roundId) ?? [];
    list.push(entry);
    byRound.set(entry.roundId, list);
  }

  const resolved: ResolvedFavorite[] = [];
  await Promise.all(
    Array.from(byRound.entries()).map(async ([roundId, list]) => {
      const round = await ensureRound(roundId);
      if (!round) return;
      const qIndex = new Map<string, Question>();
      for (const q of round.questions) qIndex.set(q.id, q);
      for (const entry of list) {
        const question = qIndex.get(entry.questionId);
        if (!question) continue;
        resolved.push({ entry, question, roundTitle: round.title });
      }
    }),
  );

  return resolved;
}

/**
 * 트랙별로 그룹핑. trackId가 없는 문제는 "기타"로 묶음.
 * tracks 메타로 트랙 제목을 lookup; 매칭 안 되면 trackId 자체를 제목으로.
 */
export function groupFavoritesByTrack(
  resolved: ResolvedFavorite[],
  trackTitleOf: (trackId: string) => string | undefined,
): FavoriteGroup[] {
  const groups = new Map<string, FavoriteGroup>();
  for (const r of resolved) {
    const key = r.entry.trackId ?? UNCATEGORIZED_KEY;
    if (!groups.has(key)) {
      const isUncat = key === UNCATEGORIZED_KEY;
      groups.set(key, {
        trackId: isUncat ? null : (r.entry.trackId ?? null),
        trackTitle: isUncat
          ? "기타"
          : (trackTitleOf(r.entry.trackId!) ?? r.entry.trackId!),
        count: 0,
        resolved: [],
      });
    }
    const g = groups.get(key)!;
    g.count += 1;
    g.resolved.push(r);
  }
  return Array.from(groups.values()).sort((a, b) => b.count - a.count);
}

/**
 * 그룹 내에서 섹션 키와 난이도 옵션을 추출. UI 필터 칩 용도.
 * 각 옵션에 매칭 개수도 같이 반환.
 */
export interface SectionOption {
  key: string;
  count: number;
}

export interface DifficultyOption {
  difficulty: Difficulty;
  count: number;
}

export function deriveFilterOptions(group: FavoriteGroup): {
  sections: SectionOption[];
  difficulties: DifficultyOption[];
} {
  const sectionMap = new Map<string, number>();
  const difficultyMap = new Map<Difficulty, number>();
  for (const r of group.resolved) {
    const sec = r.question.section ?? "(미분류)";
    sectionMap.set(sec, (sectionMap.get(sec) ?? 0) + 1);
    if (r.question.difficulty !== undefined) {
      difficultyMap.set(
        r.question.difficulty,
        (difficultyMap.get(r.question.difficulty) ?? 0) + 1,
      );
    }
  }
  const sections = Array.from(sectionMap.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
  const difficulties = (
    Array.from(difficultyMap.entries()) as [Difficulty, number][]
  )
    .map(([difficulty, count]) => ({ difficulty, count }))
    .sort((a, b) => a.difficulty - b.difficulty);
  return { sections, difficulties };
}

/** spec 조건으로 필터링된 풀을 반환. */
export function filterPool(
  group: FavoriteGroup,
  sectionKeys: string[],
  difficulties: Difficulty[],
): ResolvedFavorite[] {
  const sectionSet = new Set(sectionKeys);
  const diffSet = new Set(difficulties);
  return group.resolved.filter((r) => {
    if (sectionSet.size > 0) {
      const sec = r.question.section ?? "(미분류)";
      if (!sectionSet.has(sec)) return false;
    }
    if (diffSet.size > 0) {
      if (r.question.difficulty === undefined) return false;
      if (!diffSet.has(r.question.difficulty)) return false;
    }
    return true;
  });
}

/**
 * spec → 가상 Round.
 * id는 'favorites:{trackId}:{ts}' 형태로 storage 가드와 일치한다.
 */
/** 단일 문제 미리보기/풀이용 가상 round. 결과 화면을 띄우지 않는다. */
export function buildSinglePreviewRound(resolved: ResolvedFavorite): Round {
  return {
    id: `${FAVORITE_PREVIEW_PREFIX}${resolved.entry.questionId}:${Date.now()}`,
    trackId: resolved.entry.trackId,
    title: resolved.roundTitle || "헷갈린 문제",
    description: "즐겨찾기 미리보기",
    questions: [
      {
        ...resolved.question,
        sourceRoundId: resolved.entry.roundId,
        sourceTrackId: resolved.entry.trackId,
      },
    ],
    questionCount: 1,
  };
}

export function buildFavoritePoolRound(
  spec: FavoritePoolSpec,
  pool: ResolvedFavorite[],
): Round | null {
  if (pool.length === 0) return null;
  const take = Math.min(Math.max(1, spec.count), pool.length);
  const picked = shuffle(pool)
    .slice(0, take)
    .map((r) => ({
      ...r.question,
      sourceRoundId: r.entry.roundId,
      sourceTrackId: r.entry.trackId,
    }));
  const trackKey = spec.trackId ?? "etc";
  return {
    id: `${FAVORITE_POOL_PREFIX}${trackKey}:${Date.now()}`,
    trackId: spec.trackId ?? undefined,
    title: `${spec.trackTitle} 헷갈린 문제 ${picked.length}개`,
    description: "즐겨찾기 모아풀기",
    questions: picked,
    questionCount: picked.length,
  };
}
