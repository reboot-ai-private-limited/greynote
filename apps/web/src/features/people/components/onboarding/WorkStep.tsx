import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Select } from '@/components/ui/Select';
import { useDesignations } from '../../hooks/useMasterData';
import { useUser } from '../../hooks/useUsers';
import { DESIGNATION_LABEL } from '../../lib/masterData';
import { isTopDesignation } from '../../lib/onboarding';
import { ManagerPickerDialog } from '../ManagerPickerDialog';
import { TerritoryPicker } from '../TerritoryPicker';
import { Grid, StepFrame, type StepProps } from './StepFrame';

export function WorkStep({ form, update, errors }: StepProps) {
  const designations = useDesignations();
  const savedManager = useUser(form.managerName ? null : form.managerId || null);
  const [picking, setPicking] = useState(false);

  const top = isTopDesignation(form.designationId, designations.data ?? []);
  const designation = (designations.data ?? []).find((d) => d.id === form.designationId);
  const level = designation?.level;
  const managerName = form.managerName || savedManager.data?.name || '';

  return (
    <StepFrame title="Designation, HQ and manager">
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
          // One HQ for every designation (2026-11-26). Routes come from it, so none are ticked here; Zones are not stored.
          <TerritoryPicker
            hqIds={form.hqIds}
            errors={errors}
            onHqsChange={(hqIds) => update({ hqIds, zoneIds: [], routeIds: [], managerId: '', managerName: '', managerExtend: null })}
          />
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
              hint="Anyone at a higher designation, wherever they are based; a vacant level can be skipped. With no manager, approvals go straight to Admin or HR."
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
