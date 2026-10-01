import type { ReactNode } from 'react';
import { Badge, type BadgeTone } from './Badge';

export function StatTile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: ReactNode;
  note?: string;
  tone?: BadgeTone;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <p className="text-[13px] font-medium text-text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-text">{value}</p>
      {note ? <div className="mt-2">{tone ? <Badge tone={tone}>{note}</Badge> : <p className="text-[13px] text-text-subtle">{note}</p>}</div> : null}
    </div>
  );
}
