import Link from 'next/link';
import type { PayrollWarningsDto } from '@greynote/contracts';
import { warningLinks } from '../lib/payrollWarnings';

/** "Not blocked, but check": who has no ESI or EPF number. Each line opens the Employees list narrowed to those people. */
export function PayrollWarnings({ warnings, className }: { warnings: PayrollWarningsDto | undefined; className?: string }) {
  const links = warningLinks(warnings);
  if (links.length === 0) return null;
  return (
    <div role="status" className={`rounded-lg border border-border bg-warning-bg px-4 py-2.5 text-sm text-warning-fg ${className ?? ''}`}>
      <p className="font-medium">Check these (nothing is blocked):</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {links.map((l) => (
          <li key={l.key}>
            <Link href={l.href} className="underline hover:no-underline">
              {l.text}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
