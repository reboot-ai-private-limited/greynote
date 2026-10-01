'use client';

import { SideNav } from '@/components/shell/SideNav';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';

/** The real navigation next to a page, with a marker on the content's left edge to prove it never shifts. */
export function ShellPreview() {
  return (
    <div className="flex min-h-screen">
      <SideNav role="ADMIN" open={false} onClose={() => undefined} />
      <main className="min-w-0 flex-1 px-8 py-8">
        <PageHeader title="Shell preview" description="Hover the rail, or Tab into it. The content must not move." />
        <div id="content-edge" className="border-l-4 border-accent pl-4 text-sm text-text-muted">
          This block&rsquo;s left edge stays put while the rail expands over it.
        </div>
        <Card className="mt-6 p-6">
          <p className="text-sm text-text-muted">Content under the expanded rail is simply covered, not reflowed.</p>
        </Card>
      </main>
    </div>
  );
}
