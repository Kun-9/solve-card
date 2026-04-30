import { useEffect, useMemo, useState } from "react";
import type { Difficulty, FavoriteEntry, Round } from "../types";
import { DIFFICULTY_LABEL } from "../types";
import {
  deriveFilterOptions,
  filterPool,
  type FavoriteGroup,
  type FavoritePoolSpec,
  type ResolvedFavorite,
} from "../data/favorites";
import { FavoriteStar } from "./FavoriteStar";

interface FavoritesDrilldownProps {
  group: FavoriteGroup;
  onBack: () => void;
  onToggleFavorite: (entry: FavoriteEntry) => void;
  onStart: (round: Round, label: string) => void;
  onPreview: (resolved: ResolvedFavorite) => void;
  buildPoolRound: (
    spec: FavoritePoolSpec,
    pool: ResolvedFavorite[],
  ) => Round | null;
}

export function FavoritesDrilldown({
  group,
  onBack,
  onToggleFavorite,
  onStart,
  onPreview,
  buildPoolRound,
}: FavoritesDrilldownProps) {
  const { sections, difficulties } = useMemo(
    () => deriveFilterOptions(group),
    [group],
  );

  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [selectedDifficulties, setSelectedDifficulties] = useState<Difficulty[]>(
    [],
  );

  const pool = useMemo(
    () => filterPool(group, selectedSections, selectedDifficulties),
    [group, selectedSections, selectedDifficulties],
  );

  const presetOptions = useMemo(() => {
    const presets = [5, 10, 20];
    const fitting = presets.filter((p) => p < pool.length);
    return [
      ...fitting.map((p) => ({ value: p, label: String(p) })),
      { value: pool.length, label: "전체" },
    ];
  }, [pool.length]);

  const [count, setCount] = useState<number>(() =>
    Math.min(5, Math.max(1, group.count)),
  );
  // 풀 크기/필터가 바뀌면 현재 count가 유효한 프리셋이 아닐 수 있어 가장 가까운 값으로 보정
  useEffect(() => {
    if (presetOptions.length === 0) return;
    const exists = presetOptions.some((p) => p.value === count);
    if (!exists) {
      const next = presetOptions[0]?.value ?? pool.length;
      setCount(next);
    }
  }, [presetOptions, count, pool.length]);

  const clampedCount = Math.min(Math.max(1, count), Math.max(1, pool.length));
  const canStart = pool.length > 0;
  const filtersActive =
    selectedSections.length > 0 || selectedDifficulties.length > 0;

  function toggleSection(key: string) {
    setSelectedSections((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }
  function toggleDifficulty(d: Difficulty) {
    setSelectedDifficulties((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    );
  }

  function handleStart() {
    const spec: FavoritePoolSpec = {
      trackId: group.trackId,
      trackTitle: group.trackTitle,
      sectionKeys: selectedSections,
      difficulties: selectedDifficulties,
      count: clampedCount,
    };
    const round = buildPoolRound(spec, pool);
    if (!round) return;
    const label = `${group.trackTitle} 헷갈린 문제 · 랜덤 ${round.questions.length}개`;
    onStart(round, label);
  }

  return (
    <div className="stack-xl stack">
      <section className="stack" style={{ gap: 12 }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onBack}
          style={{ alignSelf: "flex-start" }}
        >
          ← 북마크
        </button>
        <h1 className="h-display">{group.trackTitle}</h1>
        <p className="body-lg">헷갈린 문제 {group.count}개</p>
      </section>

      {sections.length > 0 && (
        <section className="stack" style={{ gap: 8 }}>
          <span className="caption">섹션</span>
          <div className="drill-filter-row">
            {sections.map((s) => (
              <button
                key={s.key}
                type="button"
                className="drill-chip"
                aria-pressed={selectedSections.includes(s.key)}
                onClick={() => toggleSection(s.key)}
              >
                {s.key} · {s.count}
              </button>
            ))}
          </div>
        </section>
      )}

      {difficulties.length > 0 && (
        <section className="stack" style={{ gap: 8 }}>
          <span className="caption">난이도</span>
          <div className="drill-filter-row">
            {difficulties.map((d) => (
              <button
                key={d.difficulty}
                type="button"
                className="drill-chip"
                aria-pressed={selectedDifficulties.includes(d.difficulty)}
                onClick={() => toggleDifficulty(d.difficulty)}
              >
                {DIFFICULTY_LABEL[d.difficulty]} · {d.count}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="drill-runner card">
        <span className="caption">몇 개를 풀까요?</span>
        <div className="drill-filter-row">
          {presetOptions.map((p) => (
            <button
              key={p.label}
              type="button"
              className="drill-chip"
              aria-pressed={clampedCount === p.value}
              onClick={() => setCount(p.value)}
              disabled={pool.length === 0}
            >
              {p.label === "전체" ? `전체 ${p.value}개` : `${p.label}개`}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={!canStart}
          onClick={() => handleStart()}
        >
          랜덤 {clampedCount}개 풀기
        </button>
      </section>

      {pool.length > 0 && (
        <section className="stack" style={{ gap: 8 }}>
          <span className="caption">
            {filtersActive ? `선택한 ${pool.length}개` : `전체 ${pool.length}개`}
          </span>
          <div className="drill-preview-list">
            {pool.slice(0, 30).map((r) => (
              <div key={r.entry.questionId} className="drill-preview-row">
                <FavoriteStar
                  active
                  size={16}
                  onToggle={() => onToggleFavorite(r.entry)}
                />
                <button
                  type="button"
                  className="drill-preview-prompt-btn"
                  onClick={() => onPreview(r)}
                  title={r.question.prompt}
                >
                  <span className="drill-preview-prompt">
                    {r.question.prompt.replace(/\n/g, " ")}
                  </span>
                </button>
                <span className="drill-preview-meta">
                  {r.question.section ?? ""}
                </span>
              </div>
            ))}
            {pool.length > 30 && (
              <span className="caption" style={{ paddingTop: 4 }}>
                + {pool.length - 30}개 더
              </span>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
