'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { HolidaysTab } from './HolidaysTab';
import { LeavesTab } from './LeavesTab';

const TABS = [
  { value: 'leaves', label: 'Leaves' },
  { value: 'holidays', label: 'Holidays' },
] as const;
type TabValue = (typeof TABS)[number]['value'];

/**
 * Leave and holidays, the daily work: everyone's leaves and the holiday calendar. The rules HR sets once (leave types, the leave master) moved
 * to Leave setup (web refactor, 2026-10-13); a link made to those tabs still lands there. The tab lives in the URL, and switching tabs clears the
 * previous tab's filters so they do not leak across.
 */
export function HrScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = params.get('tab');
  const moved = requested === 'types' || requested === 'master';
  useEffect(() => {
    if (moved) router.replace(`/leave-setup?tab=${requested}`);
  }, [moved, requested, router]);
  const tab: TabValue = TABS.some((t) => t.value === requested) ? (requested as TabValue) : 'leaves';

  return (
    <>
      <PageHeader
        title="Leave & holidays"
        description="Everyone's leaves and the holiday calendar."
        actions={
          <Link href="/leave-setup" className="text-sm font-medium text-accent hover:underline">
            Leave setup (types and days per grade)
          </Link>
        }
      />
      <Tabs value={tab} onValueChange={(next) => router.replace(`${pathname}?tab=${next}`)}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="leaves" className="mt-6">
          <LeavesTab />
        </TabsContent>
        <TabsContent value="holidays" className="mt-6">
          <HolidaysTab />
        </TabsContent>
      </Tabs>
    </>
  );
}
