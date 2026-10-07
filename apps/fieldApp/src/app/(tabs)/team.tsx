import { TabPlaceholder } from '@/components/tab-placeholder';

// TODO: the Team tab (PRD §7.1) — backed by apps/api's approval module (/inbox, /team, /:id).
// Only managers see this tab; see src/components/app-tabs.tsx.
export default function TeamScreen() {
  return (
    <TabPlaceholder
      title="Team"
      summary="Approve your direct reports’ submissions and follow your team’s work."
      upcoming={[
        'Inbox — Plans, DCRs, Leave and Services waiting for your approval',
        'Team activity — your wider team’s submissions (view only)',
        'Request detail — history, approve or reject with a comment',
      ]}
    />
  );
}
