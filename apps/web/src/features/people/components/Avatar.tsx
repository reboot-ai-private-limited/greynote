import { cn } from '@/components/ui/cn';

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

/** The employee's photo in a circle, or their initials when there is none. */
export function Avatar({ name, url, className }: { name: string; url?: string | null | undefined; className?: string }) {
  return url ? (
    <img src={url} alt="" className={cn('shrink-0 rounded-full border border-border object-cover', className ?? 'size-8')} />
  ) : (
    <span
      aria-hidden="true"
      className={cn('flex shrink-0 items-center justify-center rounded-full bg-surface-hover text-xs font-medium text-text-muted', className ?? 'size-8')}
    >
      {initialsOf(name) || '?'}
    </span>
  );
}
