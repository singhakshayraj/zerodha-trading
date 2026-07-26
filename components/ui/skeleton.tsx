// Shimmer placeholder for loading states — replaces bare "Loading…" text so
// the layout doesn't jump when data arrives. Matches the dark theme.
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`animate-pulse rounded-md bg-[#1a1a1a] ${className}`}
    />
  );
}
