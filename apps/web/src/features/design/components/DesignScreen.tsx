'use client';

import type { PlaceDto } from '@greynote/contracts';
import { Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column, type SortState } from '@/components/ui/DataTable';
import { Dialog } from '@/components/ui/Dialog';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { Input, Textarea } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { StatTile } from '@/components/ui/StatTile';
import { ActionTile } from '@/features/dashboard/components/ActionTile';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { toast } from '@/components/ui/toast';
import { PlacePicker } from '@/features/territory/components/PlacePicker';
import type { PlaceSearchState } from '@/features/territory/hooks/usePlaceSearch';
import { palette, semantic, status } from '@/styles/tokens';

interface Row {
  id: string;
  name: string;
  hq: string;
  amount: number;
  state: 'Approved' | 'Pending' | 'Rejected';
}

const rows: Row[] = [
  { id: '1', name: 'Anita Rao', hq: 'Kolkata', amount: 1284050, state: 'Approved' },
  { id: '2', name: 'Vikram Shah', hq: 'Siliguri', amount: 842000, state: 'Pending' },
  { id: '3', name: 'Meera Nair', hq: 'Durgapur', amount: 56075, state: 'Rejected' },
];

const PLACES = [
  { label: 'Siliguri Junction', address: 'Siliguri, West Bengal', latitude: 26.7109, longitude: 88.4283, placeId: 'p-siliguri' },
  { label: 'Matigara Bus Stand', address: 'Matigara, Siliguri', latitude: 26.6866, longitude: 88.3921, placeId: 'p-matigara' },
  { label: 'Bagdogra Airport', address: 'Bagdogra, West Bengal', latitude: 26.6812, longitude: 88.3286, placeId: 'p-bagdogra' },
  { label: 'Sevoke Road Market', address: 'Sevoke Rd, Siliguri', latitude: 26.7381, longitude: 88.4204, placeId: 'p-sevoke' },
];

/** A search that costs nothing: filters a fixed list, so the editor can be tried without the API or a key. */
function useStubSearch(term: string): PlaceSearchState {
  const t = term.trim().toLowerCase();
  const ready = t.length >= 3;
  return { ready, isLoading: false, error: null, candidates: ready ? PLACES.filter((p) => p.label.toLowerCase().includes(t)) : [] };
}

const tone = { Approved: 'success', Pending: 'warning', Rejected: 'danger' } as const;

const columns: readonly Column<Row>[] = [
  { key: 'name', header: 'Employee', sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
  { key: 'hq', header: 'HQ', render: (r) => r.hq },
  { key: 'amount', header: 'Amount', numeric: true, sortable: true, render: (r) => `₹${(r.amount / 100).toLocaleString('en-IN')}` },
  { key: 'state', header: 'Status', render: (r) => <Badge tone={tone[r.state]}>{r.state}</Badge> },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="border-b border-border pb-2 text-lg font-semibold text-text">{title}</h2>
      {children}
    </section>
  );
}

export function DesignScreen() {
  const [sort, setSort] = useState<SortState>({ key: 'name', order: 'asc' });
  const [dialog, setDialog] = useState(false);
  const [select, setSelect] = useState('');
  const [place, setPlace] = useState<PlaceDto | null>(null);

  return (
    <main className="mx-auto max-w-5xl space-y-12 px-8 py-10">
      <PageHeader title="Design system" description="Tokens and components, in every state. Development only." />

      <Section title="Colour ramps">
        {Object.entries(palette).map(([name, steps]) => (
          <div key={name}>
            <p className="mb-2 text-sm font-medium capitalize text-text-muted">{name}</p>
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-12">
              {Object.entries(steps).map(([step, hex]) => (
                <div key={step}>
                  <div className="h-12 rounded-md border border-border" style={{ background: hex }} />
                  <p className="mt-1 text-[11px] text-text-subtle tabular-nums">{step}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section title="Semantic and status">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.entries(semantic).map(([name, hex]) => (
            <div key={name} className="flex items-center gap-2.5">
              <div className="size-8 shrink-0 rounded-md border border-border" style={{ background: hex }} />
              <div className="min-w-0">
                <p className="truncate text-[13px] text-text">{name}</p>
                <p className="text-[11px] text-text-subtle">{hex}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <Badge tone="neutral">Draft</Badge>
          <Badge tone="accent">Info</Badge>
          {Object.keys(status).map((s) => (
            <Badge key={s} tone={s as keyof typeof status}>
              {s}
            </Badge>
          ))}
        </div>
      </Section>

      <Section title="Type">
        <div className="space-y-2">
          <p className="text-3xl font-semibold tracking-tight">Page title — 30 / semibold</p>
          <p className="text-2xl font-semibold tracking-tight">Section title — 24 / semibold</p>
          <p className="text-lg font-semibold">Card title — 18 / semibold</p>
          <p className="text-sm">Body — 14 / regular. Quarterly field activity across all zones.</p>
          <p className="text-[13px] text-text-muted">Secondary — 13 / muted</p>
          <p className="text-xs text-text-subtle">Caption — 12 / subtle</p>
          <p className="text-2xl font-semibold tabular-nums">₹12,84,050.00 · 1,234 calls</p>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>
            <Plus aria-hidden className="size-4" /> Primary
          </Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
        </div>
      </Section>

      <Section title="Form">
        <Card className="p-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Name" htmlFor="d-name" hint="As on the ID card.">
              <Input id="d-name" placeholder="Anita Rao" />
            </FormField>
            <FormField label="Employee code" htmlFor="d-code" error="That code is already taken.">
              <Input id="d-code" defaultValue="EMP01" aria-invalid />
            </FormField>
            <FormField label="Zone" htmlFor="d-zone">
              <Select
                id="d-zone"
                value={select}
                onValueChange={setSelect}
                placeholder="Choose a zone"
                options={[
                  { value: 'wb', label: 'West Bengal' },
                  { value: 'od', label: 'Odisha' },
                ]}
              />
            </FormField>
            <FormField label="Disabled" htmlFor="d-off">
              <Input id="d-off" disabled defaultValue="Locked in a past financial year" />
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="Notes" htmlFor="d-notes">
                <Textarea id="d-notes" />
              </FormField>
            </div>
          </div>
        </Card>
      </Section>

      <Section title="Stat tiles">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile label="Active employees" value="248" note="+12 this month" tone="success" />
          <StatTile label="Pending approvals" value="17" note="5 older than 2 days" tone="warning" />
          <StatTile label="Payroll (Sep)" value="₹48.2L" note="Draft" />
        </div>
      </Section>

      <Section title="Dashboard tiles — loading, error, ready, linked">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ActionTile label="Loading" query={{ data: undefined, error: null, isLoading: true, refetch: () => undefined }} map={() => ({ value: '' })} />
          <ActionTile label="Failed" query={{ data: undefined, error: new Error('x'), isLoading: false, refetch: () => undefined }} map={() => ({ value: '' })} />
          <ActionTile label="Ready" query={{ data: 12, error: null, isLoading: false, refetch: () => undefined }} map={(n) => ({ value: String(n), note: 'Oldest waiting 3d', tone: 'warning' })} />
          <ActionTile label="Linked (Zones)" href="/zones" query={{ data: 4, error: null, isLoading: false, refetch: () => undefined }} map={(n) => ({ value: String(n), note: 'All clear', tone: 'success' })} />
        </div>
      </Section>

      <Section title="Place picker — stub search (try &ldquo;sil&rdquo;, &ldquo;mat&rdquo;, &ldquo;bag&rdquo;, &ldquo;sev&rdquo;)">
        <Card className="p-5">
          <PlacePicker id="design-place" label="Destination" value={place} onChange={setPlace} useSearch={useStubSearch} />
        </Card>
      </Section>

      <Section title="Table, pagination, tabs">
        <Card>
          <Tabs defaultValue="all">
            <div className="px-5">
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="pending">Pending</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="all">
              <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} sort={sort} onSortChange={setSort} />
              <Pagination page={1} totalPages={3} total={52} onPageChange={() => undefined} />
            </TabsContent>
            <TabsContent value="pending">
              <EmptyState title="Nothing pending" description="Items waiting on you will show up here." />
            </TabsContent>
          </Tabs>
        </Card>
      </Section>

      <Section title="States">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <SkeletonTable rows={3} />
          </Card>
          <Card>
            <EmptyState title="No zones" description="No zone matches this search." />
          </Card>
          <Card>
            <ErrorState message="Could not load zones." requestId="req_01a0f779" onRetry={() => undefined} />
          </Card>
        </div>
      </Section>

      <Section title="Overlays">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => setDialog(true)}>
            Open dialog
          </Button>
          <DropdownMenu
            trigger={<Button variant="secondary">Menu</Button>}
            items={[
              { label: 'Edit', onSelect: () => undefined },
              { label: 'Deactivate', onSelect: () => undefined, tone: 'danger' },
            ]}
          />
          <Button variant="secondary" onClick={() => toast.success('Zone saved.')}>
            Success toast
          </Button>
          <Button variant="secondary" onClick={() => toast.error('Financial year 2025 is read-only.', 'req_01a0f779')}>
            Error toast
          </Button>
        </div>
        <Dialog
          open={dialog}
          onOpenChange={setDialog}
          title="Deactivate zone"
          description="The zone stays in history but is hidden from new use."
          footer={
            <>
              <Button variant="secondary" onClick={() => setDialog(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => setDialog(false)}>
                Deactivate
              </Button>
            </>
          }
        />
      </Section>
    </main>
  );
}
