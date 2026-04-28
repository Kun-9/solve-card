interface TopbarProps {
  current: "home" | "manage";
  onHome: () => void;
  onManage: () => void;
}

export function Topbar({ current, onHome, onManage }: TopbarProps) {
  const showManage = import.meta.env.DEV;
  return (
    <header className="appbar">
      <div className="container appbar-inner">
        <button type="button" className="brand" onClick={onHome}>
          <span className="brand-dot" aria-hidden />
          solve-card
        </button>
        {showManage && (
          <nav className="nav">
            <button
              type="button"
              className="btn-pill"
              aria-pressed={current === "manage"}
              onClick={onManage}
            >
              문제 관리
            </button>
          </nav>
        )}
      </div>
    </header>
  );
}
