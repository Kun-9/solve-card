import { useMemo, useState } from "react";
import type { Domain, QuestionBank, TrackMeta } from "../types";

interface HomeHubProps {
  bank: QuestionBank;
  onSelectTrack: (track: TrackMeta) => void;
  onManage: () => void;
}

const FALLBACK_CERT_TRACK: TrackMeta = {
  id: "izeng",
  domain: "cert",
  title: "정보처리기사",
  description: "필기 기출 회차",
};

export function HomeHub({ bank, onSelectTrack }: HomeHubProps) {
  const [domain, setDomain] = useState<Domain>("cert");

  const tracks = useMemo<TrackMeta[]>(() => {
    if (bank.tracks && bank.tracks.length > 0) return bank.tracks;
    // 마이그레이션 전 데이터 폴백 — 기존 회차로부터 추정
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

  const stats = useMemo(() => {
    const map = new Map<string, { rounds: number; questions: number }>();
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
  const certTotals = certTracks.reduce(
    (acc, t) => {
      const s = stats.get(t.id) ?? { rounds: 0, questions: 0 };
      acc.rounds += s.rounds;
      acc.questions += s.questions;
      return acc;
    },
    { rounds: 0, questions: 0 },
  );

  return (
    <div className="stack-xl stack">
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
                <TrackCard
                  key={track.id}
                  track={track}
                  rounds={stats.get(track.id)?.rounds ?? 0}
                  questions={stats.get(track.id)?.questions ?? 0}
                  onClick={() => onSelectTrack(track)}
                />
              ))}
            </div>
          )
        ) : (
          <div className="card empty">
            <p className="body">Dev 콘텐츠는 준비 중입니다.</p>
            <p className="caption" style={{ marginTop: 6 }}>
              백엔드 / 프론트엔드 / 아키텍처 / 데브옵스 트랙이 곧 추가돼요.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

interface TrackCardProps {
  track: TrackMeta;
  rounds: number;
  questions: number;
  onClick: () => void;
}

function TrackCard({ track, rounds, questions, onClick }: TrackCardProps) {
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
          {rounds === 0 ? "준비 중" : `${rounds}회차 · ${questions}문제`}
        </span>
      </div>
    </button>
  );
}
