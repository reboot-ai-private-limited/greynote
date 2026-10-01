/** A 2px bar for background refetches — the table stays put, only this signals activity. */
export function TopProgressBar({ active }: { active: boolean }) {
  return (
    <div aria-hidden className="h-0.5 w-full overflow-hidden bg-transparent">
      {active ? <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" /> : null}
    </div>
  );
}
