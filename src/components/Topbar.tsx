import { useState } from "react";
import type { Domain } from "../types";
import {
  avatarUrlFrom,
  displayNameFrom,
  signInWithGoogle,
  signOut,
  useAuth,
} from "../lib/useAuth";
import { useConfirm } from "./ConfirmDialog";

interface TopbarProps {
  current: "home" | "manage" | "bookmarks";
  backLabel?: string;
  onBack?: () => void;
  activeDomain?: Domain;
  onSwitchDomain?: (domain: Domain) => void;
  onHome: () => void;
  onManage: () => void;
  onBookmarks: () => void;
}

const DOMAIN_LABEL: Record<Domain, string> = {
  cert: "Cert",
  dev: "Dev",
};

export function Topbar({
  current,
  backLabel,
  onBack,
  activeDomain,
  onSwitchDomain,
  onHome,
  onManage,
  onBookmarks,
}: TopbarProps) {
  const showManage = import.meta.env.DEV;
  const { user, loading, configured } = useAuth();
  const confirm = useConfirm();

  const handleSignOut = async () => {
    const ok = await confirm({
      title: "로그아웃",
      message: "로그아웃 하시겠어요?",
      confirmLabel: "로그아웃",
    });
    if (!ok) return;
    await signOut();
  };

  const domainPill =
    activeDomain && onSwitchDomain ? (
      <div
        className="topbar-domain"
        role="radiogroup"
        aria-label="분야 선택"
      >
        {(["cert", "dev"] as Domain[]).map((d) => (
          <button
            key={d}
            type="button"
            className="btn-pill"
            role="radio"
            aria-checked={activeDomain === d}
            aria-pressed={activeDomain === d}
            onClick={() => {
              if (activeDomain !== d) onSwitchDomain(d);
            }}
          >
            {DOMAIN_LABEL[d]}
          </button>
        ))}
      </div>
    ) : null;

  const showSubrow = Boolean(onBack) || Boolean(domainPill);

  return (
    <header className="appbar">
      <div className="container appbar-inner">
        <button type="button" className="brand" onClick={onHome}>
          <span className="brand-dot" aria-hidden />
          solve-card
        </button>
        <nav className="nav">
          <button
            type="button"
            className="btn-pill"
            aria-pressed={current === "bookmarks"}
            onClick={onBookmarks}
          >
            북마크
          </button>
          {showManage && (
            <button
              type="button"
              className="btn-pill"
              aria-pressed={current === "manage"}
              onClick={onManage}
            >
              문제 관리
            </button>
          )}
          {configured && !loading && !user && (
            <button
              type="button"
              className="btn-pill"
              onClick={() => void signInWithGoogle()}
            >
              Google 로그인
            </button>
          )}
          {configured && user && (
            <button
              type="button"
              className="user-chip"
              onClick={handleSignOut}
              title="로그아웃"
            >
              <UserAvatar user={user} />
              <span className="user-chip-name">{displayNameFrom(user)}</span>
            </button>
          )}
        </nav>
      </div>
      {showSubrow && (
        <div className="container appbar-subrow">
          {onBack && (
            <button
              type="button"
              className="back-btn"
              onClick={onBack}
              aria-label={backLabel ? `${backLabel}(으)로 돌아가기` : "뒤로 가기"}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
              >
                <path
                  d="M15 6l-6 6 6 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="back-btn-label">{backLabel ?? "뒤로"}</span>
            </button>
          )}
          {domainPill}
        </div>
      )}
    </header>
  );
}

function UserAvatar({ user }: { user: NonNullable<ReturnType<typeof useAuth>["user"]> }) {
  const url = avatarUrlFrom(user);
  const [failed, setFailed] = useState(false);
  const initial = (displayNameFrom(user) || "?").trim().charAt(0).toUpperCase();
  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        className="user-avatar"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return <span className="user-avatar user-avatar-fallback">{initial}</span>;
}
