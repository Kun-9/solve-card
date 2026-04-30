interface FavoriteStarProps {
  active: boolean;
  onToggle: () => void;
  size?: number;
  label?: string;
}

export function FavoriteStar({
  active,
  onToggle,
  size = 20,
  label,
}: FavoriteStarProps) {
  const aria = label ?? (active ? "즐겨찾기 해제" : "즐겨찾기 추가");
  return (
    <button
      type="button"
      className="favorite-star"
      data-active={active ? "true" : "false"}
      onClick={(e) => {
        e.stopPropagation();
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
        <path d="M12 3.5l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 17l-5.3 2.8 1.1-5.9L3.4 9.8l6-.8z" />
      </svg>
    </button>
  );
}
