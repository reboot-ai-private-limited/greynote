import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Select } from '@/components/ui/Select';
import { useAllHqs } from '@/features/territory/hooks/useHqs';
import { RouteChecklist } from '@/features/territory/components/RouteChecklist';
import { useActiveRoutes } from '@/features/territory/hooks/useRoutes';
import { useAllZones } from '@/features/territory/hooks/useZones';
import { useDesignations } from '../../hooks/useMasterData';
import { useUser } from '../../hooks/useUsers';
import { DESIGNATION_LABEL } from '../../lib/masterData';
import { isMrDesignation, isTopDesignation } from '../../lib/onboarding';
import { ManagerPickerDialog } from '../ManagerPickerDialog';
import { Grid, StepFrame, type StepProps } from './StepFrame';

export function WorkStep({ form, update, errors }: StepProps) {
  const designations = useDesignations();
  const zones = useAllZones();
  const hqs = useAllHqs();
  const savedManager = useUser(form.managerName ? null : form.managerId || null);
  const [picking, setPicking] = useState(false);
  const isMr = isMrDesignation(form.designationId, designations.data ?? []);
  // Only this HQ's routes are offered; none load until an MR has an HQ.
  const routes = useActiveRoutes(form.hqId || undefined, isMr && Boolean(form.hqId));

  const top = isTopDesignation(form.designationId, designations.data ?? []);
  const level = (designations.data ?? []).find((d) => d.id === form.designationId)?.level;
  const managerName = form.managerName || savedManager.data?.name || '';
  const zoneHqs = (hqs.data ?? []).filter((h) => h.zoneId === form.zoneId && (h.status === 'active' || h.id === form.hqId));

  return (
    <StepFrame title="Designation, zone and manager">
      <Grid>
        <FormField label="Designation" htmlFor="w-designation" error={errors['designationId']}>
          <Select
            id="w-designation"
            value={form.designationId}
            // The manager must sit above the designation, so one picked earlier is let go (and the top reports to nobody).
            onValueChange={(v) => update({ designationId: v, managerId: '', managerName: '' })}
            options={[...(designations.data ?? [])].sort((a, b) => a.level - b.level).map((d) => ({ value: d.id, label: DESIGNATION_LABEL[d.name] }))}
            placeholder={designations.isLoading ? 'Loading…' : 'Choose a designation'}
            aria-invalid={errors['designationId'] ? true : undefined}
          />
        </FormField>
        <div />
        <FormField label="Zone" htmlFor="w-zone" error={errors['zoneId']}>
          <Select
            id="w-zone"
            value={form.zoneId}
            onValueChange={(v) => update({ zoneId: v, hqId: '', routeIds: [], managerId: '', managerName: '' })}
            options={(zones.data ?? []).filter((z) => z.status === 'active' || z.id === form.zoneId).map((z) => ({ value: z.id, label: z.name }))}
            placeholder={zones.isLoading ? 'Loading…' : 'Choose a zone'}
            aria-invalid={errors['zoneId'] ? true : undefined}
          />
        </FormField>
        <FormField label="HQ" htmlFor="w-hq" error={errors['hqId']}>
          <Select
            id="w-hq"
            value={form.hqId}
            onValueChange={(v) => update({ hqId: v, routeIds: [], managerId: '', managerName: '' })}
            options={zoneHqs.map((h) => ({ value: h.id, label: h.name }))}
            placeholder={!form.zoneId ? 'Choose a zone first' : hqs.isLoading ? 'Loading…' : zoneHqs.length === 0 ? 'No HQ in this zone' : 'Choose an HQ'}
            disabled={!form.zoneId}
            aria-invalid={errors['hqId'] ? true : undefined}
          />
        </FormField>
        {isMr ? (
          <div className="sm:col-span-2">
            <FormField label="Routes" htmlFor="w-routes" error={errors['routeIds']} hint="Required for an MR. Only this HQ's routes are listed; more can be added later from the employee page.">
              {!form.hqId ? (
                <p className="text-[13px] text-text-subtle">Choose an HQ first.</p>
              ) : routes.isLoading ? (
                <p className="text-[13px] text-text-subtle">Loading…</p>
              ) : (
                <RouteChecklist routes={routes.data ?? []} selected={form.routeIds} onChange={(ids) => update({ routeIds: ids })} emptyText="This HQ has no active routes yet. Create one under Territory → Routes first." />
              )}
            </FormField>
          </div>
        ) : null}
        {top ? (
          <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-soft-text sm:col-span-2">Top of the hierarchy: this designation has no manager.</p>
        ) : (
          <div className="sm:col-span-2">
            <FormField
              label="Manager (optional)"
              htmlFor="w-manager"
              error={errors['managerId']}
              hint="Anyone at a higher designation who covers this HQ; a vacant level can be skipped. With no manager, approvals go straight to Admin or HR."
            >
              <div className="flex items-center gap-3">
                <span id="w-manager" className="min-w-0 flex-1 truncate rounded-md border border-border-strong px-3 py-2 text-sm">
                  {managerName || <span className="text-text-subtle">No manager chosen</span>}
                </span>
                <Button variant="secondary" disabled={!level || !form.hqId} onClick={() => setPicking(true)}>
                  {form.managerId ? 'Change' : 'Choose'}
                </Button>
              </div>
            </FormField>
          </div>
        )}
      </Grid>
      {picking && level ? (
        <ManagerPickerDialog
          above={{ level, hqId: form.hqId }}
          onClose={() => setPicking(false)}
          onPick={(m) => {
            update({ managerId: m.id, managerName: m.name });
            setPicking(false);
          }}
        />
      ) : null}
    </StepFrame>
  );
}
