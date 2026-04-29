import { useState } from "react";
import {
  avatarUrlFrom,
  displayNameFrom,
  signInWithGoogle,
  signOut,
  useAuth,
} from "../lib/useAuth";
import { useConfirm } from "./ConfirmDialog";

interface TopbarProps {
  current: "home" | "manage";
  onHome: () => void;
  onManage: () => void;
}

export function Topbar({ current, onHome, onManage }: TopbarProps) {
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

  return (
    <header className="appbar">
      <div className="container appbar-inner">
        <button type="button" className="brand" onClick={onHome}>
          <span className="brand-dot" aria-hidden />
          solve-card
        </button>
        <nav className="nav">
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
