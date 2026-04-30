interface RoundBookmarkBtnProps {
  active: boolean;
  onToggle: () => void;
  size?: number;
}

export function RoundBookmarkBtn({
  active,
  onToggle,
  size = 18,
}: RoundBookmarkBtnProps) {
  const aria = active ? "북마크 해제" : "나중에 풀 회차로 북마크";
  return (
    <button
      type="button"
      className="round-bookmark-btn"
      data-active={active ? "true" : "false"}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onToggle();
      }}
      aria-pressed={active}
      aria-label={aria}
      title={aria}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M6 3h12v18l-6-4-6 4z" />
      </svg>
    </button>
  );
}
