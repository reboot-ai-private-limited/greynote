/** Gaps with no endpoint yet, in one quiet line: honest about what is missing, never faked. */
export function ComingSoonStrip({ items }: { items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <p className="text-[13px] text-text-subtle">
      <span className="font-medium text-text-muted">Coming soon:</span> {items.join(' · ')}
    </p>
  );
}
