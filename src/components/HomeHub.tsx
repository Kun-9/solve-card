import { useMemo, useState } from "react";
import type {
  CategoryMeta,
  Domain,
  InProgressSession,
  QuestionBank,
  TrackMeta,
} from "../types";

interface HomeHubProps {
  bank: QuestionBank;
  onSelectTrack: (track: TrackMeta) => void;
  onSelectCategory: (categoryId: string) => void;
  onManage: () => void;
  inProgress?: InProgressSession[];
  onResume?: (roundId: string) => void;
  onDiscardInProgress?: (roundId: string) => void;
}

const FALLBACK_CERT_TRACK: TrackMeta = {
  id: "izeng",
  domain: "cert",
  title: "정보처리기사",
  description: "필기 기출 회차",
};

interface TrackStat {
  rounds: number;
  questions: number;
}

export function HomeHub({
  bank,
  onSelectTrack,
  onSelectCategory,
  inProgress = [],
  onResume,
  onDiscardInProgress,
}: HomeHubProps) {
  const [domain, setDomain] = useState<Domain>("cert");

  const tracks = useMemo<TrackMeta[]>(() => {
    if (bank.tracks && bank.tracks.length > 0) return bank.tracks;
    const inferred = new Map<string, TrackMeta>();
    bank.rounds.forEach((r) => {
      if (!r.trackId) return;
      if (!inferred.has(r.trackId)) {
        inferred.set(r.trackId, {
          id: r.trackId,
          domain: "cert",
          title: r.trackId,
        });
      }
    });
    if (inferred.size === 0) return [FALLBACK_CERT_TRACK];
    return [...inferred.values()];
  }, [bank]);

  const trackStats = useMemo(() => {
    const map = new Map<string, TrackStat>();
    bank.rounds.forEach((r) => {
      const tid = r.trackId;
      if (!tid) return;
      const cur = map.get(tid) ?? { rounds: 0, questions: 0 };
      cur.rounds += 1;
      cur.questions += r.questionCount ?? r.questions.length;
      map.set(tid, cur);
    });
    return map;
  }, [bank]);

  const certTracks = tracks.filter((t) => t.domain === "cert");
  const devTracks = tracks.filter((t) => t.domain === "dev");

  const certTotals = certTracks.reduce(
    (acc, t) => {
      const s = trackStats.get(t.id) ?? { rounds: 0, questions: 0 };
      acc.rounds += s.rounds;
      acc.questions += s.questions;
      return acc;
    },
    { rounds: 0, questions: 0 },
  );

  /**
   * Dev 카테고리는 데이터 기반:
   * 1. bank.categories[] 가 진실의 원천.
   * 2. 트랙이 1+ 있는 카테고리만 노출(빈 카테고리는 숨김).
   * 3. 트랙은 있는데 categoryId 가 categories[] 에 없으면(고아) 임시 카테고리로 추가.
   */
  const categoriesWithStats = useMemo(() => {
    const stats = new Map<string, { tracks: number; questions: number }>();
    devTracks.forEach((t) => {
      if (!t.categoryId) return;
      const s = trackStats.get(t.id) ?? { rounds: 0, questions: 0 };
      const cur = stats.get(t.categoryId) ?? { tracks: 0, questions: 0 };
      cur.tracks += 1;
      cur.questions += s.questions;
      stats.set(t.categoryId, cur);
    });

    const known = new Map<string, CategoryMeta>();
    (bank.categories ?? []).forEach((c) => known.set(c.id, c));
    // 고아 categoryId 폴백
    devTracks.forEach((t) => {
      if (t.categoryId && !known.has(t.categoryId)) {
        known.set(t.categoryId, { id: t.categoryId, title: t.categoryId });
      }
    });

    return [...known.values()]
      .map((c) => ({ category: c, ...(stats.get(c.id) ?? { tracks: 0, questions: 0 }) }))
      .filter((row) => row.tracks > 0);
  }, [devTracks, trackStats, bank.categories]);

  const devTotals = categoriesWithStats.reduce(
    (acc, row) => {
      acc.tracks += row.tracks;
      acc.questions += row.questions;
      return acc;
    },
    { tracks: 0, questions: 0 },
  );

  const sortedInProgress = useMemo(
    () =>
      [...inProgress].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
    [inProgress],
  );

  return (
    <div className="stack-xl stack">
      {sortedInProgress.length > 0 && onResume && (
        <section className="stack" style={{ gap: 8 }}>
          <h2 className="caption" style={{ fontWeight: 600 }}>
            이어 풀기
          </h2>
          <div className="stack" style={{ gap: 8 }}>
            {sortedInProgress.map((s) => (
              <ResumeCard
                key={s.roundId}
                session={s}
                onResume={() => onResume(s.roundId)}
                onDiscard={
                  onDiscardInProgress
                    ? () => onDiscardInProgress(s.roundId)
                    : undefined
                }
              />
            ))}
          </div>
        </section>
      )}
      <section className="stack" style={{ gap: 16 }}>
        <div className="chip-row" role="radiogroup" aria-label="분야 선택">
          <button
            type="button"
            className="btn-pill"
            role="radio"
            aria-checked={domain === "cert"}
            aria-pressed={domain === "cert"}
            onClick={() => setDomain("cert")}
          >
            Cert
          </button>
          <button
            type="button"
            className="btn-pill"
            role="radio"
            aria-checked={domain === "dev"}
            aria-pressed={domain === "dev"}
            onClick={() => setDomain("dev")}
          >
            Dev
          </button>
        </div>

        <h1 className="h-display">오늘도 한 장씩.</h1>
        <p className="body-lg">
          {domain === "cert"
            ? `자격증 · ${certTracks.length}트랙 · ${certTotals.rounds}회차 · ${certTotals.questions}문제`
            : devTotals.tracks > 0
              ? `개발 · ${categoriesWithStats.length}카테고리 · ${devTotals.tracks}트랙 · ${devTotals.questions}문제`
              : "개발 학습 · 콘텐츠 준비 중"}
        </p>
      </section>

      <section className="stack">
        {domain === "cert" ? (
          certTracks.length === 0 ? (
            <div className="card empty">
              <p className="body">아직 등록된 트랙이 없어요.</p>
            </div>
          ) : (
            <div className="card-grid">
              {certTracks.map((track) => (
                <CertTrackCard
                  key={track.id}
                  track={track}
                  rounds={trackStats.get(track.id)?.rounds ?? 0}
                  questions={trackStats.get(track.id)?.questions ?? 0}
                  onClick={() => onSelectTrack(track)}
                />
              ))}
            </div>
          )
        ) : categoriesWithStats.length === 0 ? (
          <div className="card empty">
            <p className="body">Dev 콘텐츠는 준비 중이에요.</p>
            <p className="caption" style={{ marginTop: 6 }}>
              <code>create-question-dev</code> 스킬로 카테고리·트랙·챕터를 차례로
              추가하면 여기에 자동으로 노출돼요.
            </p>
          </div>
        ) : (
          <div className="card-grid">
            {categoriesWithStats.map((row) => (
              <button
                key={row.category.id}
                type="button"
                className="card card-link"
                onClick={() => onSelectCategory(row.category.id)}
              >
                <div className="stack" style={{ gap: 14 }}>
                  <span className="caption">
                    {row.category.description ?? "Dev 카테고리"}
                  </span>
                  <h3 className="h-card">{row.category.title}</h3>
                  <span className="caption">
                    {row.tracks}트랙 · {row.questions}문제
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

interface CertTrackCardProps {
  track: TrackMeta;
  rounds: number;
  questions: number;
  onClick: () => void;
}

function CertTrackCard({
  track,
  rounds,
  questions,
  onClick,
}: CertTrackCardProps) {
  const disabled = rounds === 0;
  return (
    <button
      type="button"
      className="card card-link"
      onClick={onClick}
      disabled={disabled}
    >
      <div className="stack" style={{ gap: 14 }}>
        <span className="caption">{track.description ?? "자격증"}</span>
        <h3 className="h-card">{track.title}</h3>
        <span className="caption">
          {disabled ? "준비 중" : `${rounds}회차 · ${questions}문제`}
        </span>
      </div>
    </button>
  );
}

interface ResumeCardProps {
  session: InProgressSession;
  onResume: () => void;
  onDiscard?: () => void;
}

function ResumeCard({ session, onResume, onDiscard }: ResumeCardProps) {
  const answered = Object.keys(session.selections).length;
  const total = session.total;
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
  return (
    <div className="card resume-card">
      <button
        type="button"
        className="resume-card-main"
        onClick={onResume}
        aria-label={`${session.roundTitle} 이어서 풀기`}
      >
        <div className="stack" style={{ gap: 8 }}>
          <span className="caption">
            {answered}/{total} · {pct}% 진행
          </span>
          <h3 className="h-card">{session.roundTitle}</h3>
          {session.sourceLabel && session.sourceLabel !== session.roundTitle && (
            <span className="caption muted">{session.sourceLabel}</span>
          )}
          <div className="progress-bar" aria-hidden>
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
      </button>
      {onDiscard && (
        <button
          type="button"
          className="btn btn-ghost btn-sm resume-card-discard"
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm("이 이어풀기 세션을 버리시겠어요?")) {
              onDiscard();
            }
          }}
        >
          버리기
        </button>
      )}
    </div>
  );
}
