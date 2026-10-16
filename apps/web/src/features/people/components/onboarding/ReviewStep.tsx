import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAllHqs } from '@/features/territory/hooks/useHqs';
import { useAllZones } from '@/features/territory/hooks/useZones';
import { formatMoney } from '@/lib/format';
import { useDesignations, usePayBands } from '../../hooks/useMasterData';
import { useUser } from '../../hooks/useUsers';
import { parseCtc } from '../../lib/ctc';
import { DESIGNATION_LABEL } from '../../lib/masterData';
import { territoryRule } from '../../lib/territoryRules';
import { STEPS, effectivePermanent, isTopDesignation, type AddressForm, type StepKey } from '../../lib/onboarding';
import { StepFrame, type StepProps } from './StepFrame';

const address = (a: AddressForm) => [a.line1, a.line2, a.district, a.state, a.pincode].filter(Boolean).join(', ');

function Section({ title, step, onEdit, rows }: { title: string; step: StepKey; onEdit: (step: StepKey) => void; rows: Array<[string, string | undefined]> }) {
  const shown = rows.filter(([, value]) => value);
  return (
    <section className="rounded-lg border border-border">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        <Button variant="ghost" size="sm" onClick={() => onEdit(step)} aria-label={`Edit ${title}`}>
          <Pencil aria-hidden className="size-3.5" /> Edit
        </Button>
      </header>
      {shown.length === 0 ? (
        <p className="px-4 py-3 text-sm text-text-subtle">Nothing added.</p>
      ) : (
        <dl className="grid gap-x-6 gap-y-2 px-4 py-3 text-sm sm:grid-cols-2">
          {shown.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[13px] text-text-subtle">{label}</dt>
              <dd className="break-words text-text">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

export function ReviewStep({ form, problems, onEdit }: Pick<StepProps, 'form'> & { problems: StepKey[]; onEdit: (step: StepKey) => void }) {
  const designations = useDesignations();
  const payBands = usePayBands();
  const zones = useAllZones();
  const hqs = useAllHqs();
  const manager = useUser(form.managerName ? null : form.managerId || null);

  const designation = designations.data?.find((d) => d.id === form.designationId);
  const rule = territoryRule(designation?.name);
  const names = (ids: readonly string[], list: readonly { id: string; name: string }[] | undefined) => ids.map((id) => list?.find((x) => x.id === id)?.name ?? '…').join(', ');
  const top = isTopDesignation(form.designationId, designations.data ?? []);
  const ctc = parseCtc(form.ctc);
  const labelOf = (key: StepKey) => STEPS.find((s) => s.key === key)?.label ?? key;

  return (
    <StepFrame title="Review">
      {problems.length > 0 ? (
        <p role="alert" className="mb-4 rounded-lg bg-warning-bg px-4 py-3 text-sm text-warning-fg">
          Still to fix:{' '}
          {problems.map((p, i) => (
            <span key={p}>
              {i > 0 ? ', ' : ''}
              <button type="button" className="font-medium underline" onClick={() => onEdit(p)}>
                {labelOf(p)}
              </button>
            </span>
          ))}
        </p>
      ) : null}
      <div className="space-y-4">
        <Section
          title="Personal"
          step="personal"
          onEdit={onEdit}
          rows={[
            ['Name', form.name],
            ['Guardian', form.guardianName],
            ['Mobile', form.mobileNumber],
            ['Alternate mobile', form.alternateMobile],
            ['Date of birth', form.dateOfBirth],
            ['Joining date', form.dateOfJoining],
            ['Probation', form.onProbation ? (form.probationMonths ? `${form.probationMonths} months` : 'System length') : undefined],
            ['ESI number', form.esiNumber],
            ['EPF number', form.epfNumber],
          ]}
        />
        <Section
          title="Address"
          step="address"
          onEdit={onEdit}
          rows={[
            ['Present', address(form.present)],
            ['Permanent', form.permanentSameAsPresent ? 'Same as present' : address(effectivePermanent(form))],
          ]}
        />
        <Section
          title="Qualifications"
          step="qualifications"
          onEdit={onEdit}
          rows={form.qualifications.map((q, i): [string, string] => [`${i + 1}`, `${q.degree} · ${q.institute} · ${q.yearOfPassing}`])}
        />
        <Section
          title="Experience"
          step="experience"
          onEdit={onEdit}
          rows={form.experience.map((x, i): [string, string] => [`${i + 1}`, `${x.companyName} · ${x.joiningDate}${x.endDate ? ` to ${x.endDate}` : ''}`])}
        />
        <Section
          title="Bank"
          step="bank"
          onEdit={onEdit}
          rows={[
            ['Bank', form.bankName],
            ['Branch', form.branchName],
            ['Account holder', form.accountHolderName],
            ['Account number', form.accountNumber ? `••••${form.accountNumber.slice(-4)}` : undefined],
            ['IFSC', form.ifsc],
          ]}
        />
        <Section
          title="Work"
          step="work"
          onEdit={onEdit}
          rows={[
            ['Designation', designation ? DESIGNATION_LABEL[designation.name] : undefined],
            ...(rule.zones === 'pick'
              ? [['Zones', form.zoneIds.length > 0 ? names(form.zoneIds, zones.data) : 'Every zone'] as [string, string]]
              : []),
            ...(rule.hqs !== 'none'
              ? [['HQs', form.hqIds.length > 0 ? names(form.hqIds, hqs.data) : 'Every HQ of the zones'] as [string, string]]
              : []),
            ...(rule.routes !== 'none' ? [['Routes', `${form.routeIds.length} chosen`] as [string, string]] : []),
            ['Manager', top ? 'None (top of the hierarchy)' : form.managerName || manager.data?.name || 'None (approvals go to Admin or HR)'],
          ]}
        />
        <Section
          title="Pay"
          step="compensation"
          onEdit={onEdit}
          rows={[
            ['Pay grade', payBands.data?.find((b) => b.id === form.payBandId)?.name],
            ['CTC per year', ctc === null ? undefined : formatMoney(ctc)],
          ]}
        />
      </div>
    </StepFrame>
  );
}
