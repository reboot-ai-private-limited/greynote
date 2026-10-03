'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { HolidaysTab } from './HolidaysTab';
import { LeaveMasterTab } from './LeaveMasterTab';
import { LeavesTab } from './LeavesTab';
import { LeaveTypesTab } from './LeaveTypesTab';

const TABS = [
  { value: 'leaves', label: 'Leaves' },
  { value: 'types', label: 'Leave types' },
  { value: 'master', label: 'Leave master' },
  { value: 'holidays', label: 'Holidays' },
] as const;
type TabValue = (typeof TABS)[number]['value'];

/**
 * Leave and holidays: the setups HR owns (leave types, the Leave Master, holidays) and a read-only history of leaves.
 * The tab lives in the URL, and switching tabs clears the previous tab's filters so they do not leak across.
 */
export function HrScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = params.get('tab');
  const tab: TabValue = TABS.some((t) => t.value === requested) ? (requested as TabValue) : 'leaves';

  return (
    <>
      <PageHeader title="Leave & holidays" description="Leave types, how many days each grade gets, the holiday calendar, and everyone's leaves." />
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
        <TabsContent value="types" className="mt-6">
          <LeaveTypesTab />
        </TabsContent>
        <TabsContent value="master" className="mt-6">
          <LeaveMasterTab />
        </TabsContent>
        <TabsContent value="holidays" className="mt-6">
          <HolidaysTab />
        </TabsContent>
      </Tabs>
    </>
  );
}
