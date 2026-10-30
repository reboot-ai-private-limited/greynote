import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Select } from '@/components/ui/Select';
import { RouteChecklist } from '@/features/territory/components/RouteChecklist';
import { useAllHqs } from '@/features/territory/hooks/useHqs';
import { useActiveRoutes } from '@/features/territory/hooks/useRoutes';
import { useDesignations } from '../../hooks/useMasterData';
import { useUser } from '../../hooks/useUsers';
import { DESIGNATION_LABEL } from '../../lib/masterData';
import { isTopDesignation } from '../../lib/onboarding';
import {
  afterHqsChange,
  afterZonesChange,
  territoryRule,
  zonesOfHqs,
} from '../../lib/territoryRules';
import { ManagerPickerDialog } from '../ManagerPickerDialog';
import { TerritoryPicker } from '../TerritoryPicker';
import { Grid, StepFrame, type StepProps } from './StepFrame';

export function WorkStep({ form, update, errors }: StepProps) {
  const designations = useDesignations();
  const hqs = useAllHqs();
  const savedManager = useUser(form.managerName ? null : form.managerId || null);
  const [picking, setPicking] = useState(false);

  const top = isTopDesignation(form.designationId, designations.data ?? []);
  const designation = (designations.data ?? []).find((d) => d.id === form.designationId);
  const level = designation?.level;
  const rule = territoryRule(designation?.name);
  const managerName = form.managerName || savedManager.data?.name || '';
  // Routes of the HQs ticked; every route of a newly ticked HQ is ticked by default.
  const allRoutes = useActiveRoutes(undefined, rule.routes !== 'none');
  const routes = allRoutes.data ?? [];
  const routesOfHqs = routes.filter((r) => form.hqIds.includes(r.hqId));
  const cascade = (
    next: { zoneIds: string[]; hqIds: string[]; routeIds: string[] },
    before: readonly string[],
  ) => afterHqsChange(next, before, routes, rule);

  return (
    <StepFrame title="Designation, territory and manager">
      <Grid>
        <FormField label="Designation" htmlFor="w-designation" error={errors['designationId']}>
          <Select
            id="w-designation"
            value={form.designationId}
            // What a designation covers differs, and the manager must sit above it, so the territory and manager are let go.
            onValueChange={(v) =>
              update({
                designationId: v,
                zoneIds: [],
                hqIds: [],
                routeIds: [],
                managerId: '',
                managerName: '',
                managerExtend: null,
              })
            }
            options={[...(designations.data ?? [])]
              .sort((a, b) => a.level - b.level)
              .map((d) => ({ value: d.id, label: DESIGNATION_LABEL[d.name] }))}
            placeholder={designations.isLoading ? 'Loading…' : 'Choose a designation'}
            aria-invalid={errors['designationId'] ? true : undefined}
          />
        </FormField>
        <div />
        {designation ? (
          <TerritoryPicker
            rule={rule}
            zoneIds={form.zoneIds}
            hqIds={form.hqIds}
            errors={errors}
            onZonesChange={(zoneIds) => {
              const before = {
                zoneIds: [...new Set([...form.zoneIds, ...zonesOfHqs(form.hqIds, hqs.data ?? [])])],
                hqIds: form.hqIds,
              };
              const next = afterZonesChange(
                rule,
                { zoneIds, hqIds: form.hqIds, routeIds: form.routeIds },
                before,
                hqs.data ?? [],
                routes,
              );
              update({ ...next, managerId: '', managerName: '', managerExtend: null });
            }}
            onHqsChange={(hqIds) => {
              const next = cascade(
                { zoneIds: form.zoneIds, hqIds, routeIds: form.routeIds },
                form.hqIds,
              );
              update({ ...next, managerId: '', managerName: '', managerExtend: null });
            }}
          />
        ) : null}
        {rule.routes !== 'none' && form.hqIds.length > 0 ? (
          <div className="sm:col-span-2">
            <FormField
              label={rule.routes === 'required' ? 'Routes' : 'Routes (optional)'}
              htmlFor="w-routes"
              error={errors['routeIds']}
              hint="Every route of an HQ you choose is ticked; untick any not needed. Routes created later are added from the employee page."
            >
              {allRoutes.isLoading ? (
                <p className="text-[13px] text-text-subtle">Loading…</p>
              ) : (
                <RouteChecklist
                  routes={routesOfHqs}
                  selected={form.routeIds}
                  onChange={(ids) => update({ routeIds: ids })}
                  emptyText="These HQs have no active routes yet. Create one under Territory → Routes first."
                />
              )}
            </FormField>
          </div>
        ) : null}
        {top ? (
          <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-soft-text sm:col-span-2">
            Top of the hierarchy: this designation has no manager.
          </p>
        ) : (
          <div className="sm:col-span-2">
            <FormField
              label="Manager (optional)"
              htmlFor="w-manager"
              error={errors['managerId']}
              hint="Anyone at a higher designation who covers this HQ; a vacant level can be skipped. With no manager, approvals go straight to Admin or HR."
            >
              <div className="flex items-center gap-3">
                <span
                  id="w-manager"
                  className="min-w-0 flex-1 truncate rounded-md border border-border-strong px-3 py-2 text-sm"
                >
                  {managerName || <span className="text-text-subtle">No manager chosen</span>}
                </span>
                <Button variant="secondary" disabled={!level} onClick={() => setPicking(true)}>
                  {form.managerId ? 'Change' : 'Choose'}
                </Button>
              </div>
            </FormField>
          </div>
        )}
      </Grid>
      {picking && level ? (
        <ManagerPickerDialog
          above={{ level, hqId: form.hqIds[0] }}
          offer={{ hqId: form.hqIds[0], routeIds: form.routeIds }}
          onClose={() => setPicking(false)}
          onPick={(m) => {
            update({ managerId: m.id, managerName: m.name, managerExtend: m.extend ?? null });
            setPicking(false);
          }}
        />
      ) : null}
    </StepFrame>
  );
}
