'use client';

import type { ExtendManagerTerritoryDto, UserDetailDto } from '@greynote/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Select } from '@/components/ui/Select';
import { useExtendManagerTerritory } from '@/features/territory/hooks/useManagerCoverage';
import { useUserRoutes } from '@/features/territory/hooks/useUserRoutes';
import { useDesignations, usePayBands } from '../hooks/useMasterData';
import { useUpdateUser, useUser } from '../hooks/useUsers';
import { DESIGNATION_LABEL } from '../lib/masterData';
import { buildWork, workToDraft, type WorkDraft } from '../lib/profile';
import { ManagerPickerDialog } from './ManagerPickerDialog';
import { Field, FieldList, SectionCard, SectionForm } from './SectionCard';

/** Designation, pay grade and manager: what places an employee in the reporting chain and on a pay grade. */
export function WorkSection({
  user,
  readOnly,
  startEditing = false,
}: {
  user: UserDetailDto;
  readOnly: boolean;
  startEditing?: boolean;
}) {
  const p = user.profile;
  const designations = useDesignations();
  const payBands = usePayBands();
  const manager = useUser(p?.managerId);
  const designation = designations.data?.find((d) => d.id === p?.designationId);
  const payBand = payBands.data?.find((b) => b.id === p?.payBandId);

  return (
    <SectionCard
      startEditing={startEditing}
      title="Designation, pay grade and manager"
      description="Sets the reporting chain and the TA and DA rates. The CTC is set per employee under Compensation."
      readOnly={readOnly}
      view={
        <FieldList>
          <Field label="Designation">
            {designation ? DESIGNATION_LABEL[designation.name] : null}
          </Field>
          <Field label="Pay grade">{payBand?.name}</Field>
          <Field label="Manager">
            {manager.data ? `${manager.data.name} (${manager.data.employeeCode})` : null}
          </Field>
        </FieldList>
      }
      renderForm={(close) => <WorkForm user={user} onDone={close} />}
    />
  );
}

function WorkForm({ user, onDone }: { user: UserDetailDto; onDone: () => void }) {
  const [draft, setDraft] = useState<WorkDraft>(workToDraft(user.profile));
  const [managerName, setManagerName] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const designations = useDesignations();
  const payBands = usePayBands();
  const currentManager = useUser(user.profile?.managerId);
  // What the manager picker offered to add to the manager's territory; sent once the manager is saved.
  const [extend, setExtend] = useState<{
    managerId: string;
    body: ExtendManagerTerritoryDto;
  } | null>(null);
  const extendTerritory = useExtendManagerTerritory();
  const myRoutes = useUserRoutes(user.id);
  const update = useUpdateUser(user.id, () => {
    if (extend && extend.managerId === draft.managerId)
      extendTerritory.mutate(extend, { onSettled: onDone });
    else onDone();
  });

  function submit() {
    const built = buildWork(user.profile, draft, user.id);
    if (!built.ok) return setErrors(built.errors);
    if (Object.keys(built.body).length === 0) return onDone();
    update.mutate(built.body);
  }

  const designationLevel = (designations.data ?? []).find(
    (d) => d.id === draft.designationId,
  )?.level;
  const shownManager =
    managerName ??
    (draft.managerId === user.profile?.managerId ? currentManager.data?.name : null) ??
    null;

  return (
    <>
      <SectionForm pending={update.isPending} onCancel={onDone} onSubmit={submit}>
        <FormField label="Designation" htmlFor="work-designation" error={errors['designationId']}>
          <Select
            id="work-designation"
            value={draft.designationId}
            onValueChange={(v) => setDraft((d) => ({ ...d, designationId: v }))}
            options={[...(designations.data ?? [])]
              .sort((a, b) => a.level - b.level)
              .map((d) => ({ value: d.id, label: DESIGNATION_LABEL[d.name] }))}
            placeholder={designations.isLoading ? 'Loading…' : 'Choose a designation'}
          />
        </FormField>
        <FormField label="Pay grade" htmlFor="work-payband" error={errors['payBandId']}>
          <Select
            id="work-payband"
            value={draft.payBandId}
            onValueChange={(v) => setDraft((d) => ({ ...d, payBandId: v }))}
            options={[...(payBands.data ?? [])]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((b) => ({ value: b.id, label: b.name }))}
            placeholder={payBands.isLoading ? 'Loading…' : 'Choose a pay grade'}
          />
        </FormField>
        <FormField label="Manager" htmlFor="work-manager" error={errors['managerId']}>
          <div className="flex items-center gap-3">
            <span id="work-manager" className="min-w-0 flex-1 truncate text-sm">
              {shownManager ?? <span className="text-text-subtle">No manager chosen</span>}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={!designationLevel}
              onClick={() => setPicking(true)}
            >
              {draft.managerId ? 'Change' : 'Choose'}
            </Button>
          </div>
        </FormField>
      </SectionForm>
      {picking && designationLevel ? (
        <ManagerPickerDialog
          selfId={user.id}
          above={{ level: designationLevel, hqId: user.profile?.hqId ?? undefined }}
          offer={{
            hqId: user.profile?.hqId ?? undefined,
            routeIds: (myRoutes.data ?? []).map((r) => r.id),
          }}
          onClose={() => setPicking(false)}
          onPick={(m) => {
            setExtend(m.extend ? { managerId: m.id, body: m.extend } : null);
            setDraft((d) => ({ ...d, managerId: m.id }));
            setManagerName(m.name);
            setPicking(false);
          }}
        />
      ) : null}
    </>
  );
}
