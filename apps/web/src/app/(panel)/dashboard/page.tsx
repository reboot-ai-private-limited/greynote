import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" description="An overview of the field force." />
      <Card>
        <EmptyState title="Nothing to show yet" description="Dashboard tiles appear here as modules are built." />
      </Card>
    </>
  );
}
