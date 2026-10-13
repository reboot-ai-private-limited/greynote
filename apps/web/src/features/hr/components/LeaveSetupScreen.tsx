'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { LeaveMasterTab } from './LeaveMasterTab';
import { LeaveTypesTab } from './LeaveTypesTab';

const TABS = [
  { value: 'types', label: 'Leave types' },
  { value: 'master', label: 'Leave master' },
] as const;
type TabValue = (typeof TABS)[number]['value'];

/**
 * The leave rules HR sets once and rarely changes (web refactor, 2026-10-13): which leave types exist, and how many days each pay grade gets of each.
 * Day-to-day leave work (everyone's leaves, the holiday calendar) stays on Leave & holidays.
 */
export function LeaveSetupScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const requested = useSearchParams().get('tab');
  const tab: TabValue = TABS.some((t) => t.value === requested) ? (requested as TabValue) : 'types';

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/hr" className="text-text-muted hover:text-accent hover:underline">
          ← Leave &amp; holidays
        </Link>
      </p>
      <PageHeader title="Leave setup" description="Which leave types exist, and how many days each pay grade gets. Set once; change when the policy does." />
      <Tabs value={tab} onValueChange={(next) => router.replace(`${pathname}?tab=${next}`)}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="types" className="mt-6">
          <LeaveTypesTab />
        </TabsContent>
        <TabsContent value="master" className="mt-6">
          <LeaveMasterTab />
        </TabsContent>
      </Tabs>
    </>
  );
}
