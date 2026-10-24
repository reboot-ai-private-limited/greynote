'use client';

import type { MonthlyPlanDetailDto, WorkingType } from '@greynote/contracts';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ApiError } from '@/lib/api/ApiError';
import { EmployeePickerField, WorkWithName } from '@/features/people/components/EmployeePickerField';
import { useAmendMonthlyPlan, usePlanOwnerRoutes } from '../hooks/usePreviews';
import { amendEntries, changedDates, clearedForType, dayProblem, draftsOf, isFieldDay, isTripDay, localToday, nextDay, offDayLabel, planDayLabel, tripLines, withDay, type DraftDay } from '../lib/plans';
import { DAY_KIND_LABEL, WORKING_TYPE_LABEL } from '../lib/review';
import { PlanDayView } from './PlanDayView';

/** The server refuses a longer reason. */
const REASON_MAX = 500;
const ROUTE_TYPE_LABEL = { HQ: 'HQ', EX_STATION: 'Ex-station', OUT_STATION: 'Out-station' } as const;
const EMPTY_DAY: DraftDay = { workingType: 'FIELD_WORK', dayKind: 'NORMAL', workWith: [], routeIds: [], remarks: null, returnDate: null };
const TYPE_OPTIONS = (Object.keys(WORKING_TYPE_LABEL) as WorkingType[]).map((value) => ({ value, label: WORKING_TYPE_LABEL[value] }));

const datesOf = (month: string) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return Array.from({ length: new Date(Date.UTC(y, m, 0)).getUTCDate() }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
};

/**
 * Admin changes an employee's Monthly Plan while it waits for approval: the same edit a manager makes in the app
 * (`PATCH /planning/monthly/:id/amend`). The whole month goes with an optional reason; the plan keeps waiting for the decision,
 * the days it replaces are kept on the plan, and the employee is told. Weekly offs and holidays stay locked.
 *
 * `approved`: the plan is past the manager. Only days after today can change; today and earlier days are locked, and a trip that has
 * begun can only get a new return date (later than today), since its stay and transit days follow from it.
 */
export function AmendMonthlyPlanDialog({ plan, approved = false, onClose }: { plan: MonthlyPlanDetailDto; approved?: boolean; onClose: () => void }) {
  const ownerRoutes = usePlanOwnerRoutes(plan.id);
  const original = useMemo(() => draftsOf(plan.entries), [plan]);
  const [edited, setEdited] = useState(original);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<DraftDay>(EMPTY_DAY);
  const [formError, setFormError] = useState<string>();
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string>();
  const [stale, setStale] = useState(false);
  // The trips about to be saved, shown for a yes before they are: a stay and a way back follow from a return date.
  const [tripConfirm, setTripConfirm] = useState<Array<{ date: string; lines: string[] }> | null>(null);
  const amend = useAmendMonthlyPlan(plan.id, onClose);

  // The employee's routes, plus any already on the plan that aren't in that list (a manager's plan may use their team's).
  const routes = useMemo(() => {
    const byId = new Map((ownerRoutes.data ?? []).map((r) => [r.id, r]));
    for (const r of plan.routes) byId.set(r.id, byId.get(r.id) ?? r);
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [ownerRoutes.data, plan.routes]);
  const offByDate = useMemo(() => new Map(plan.offDays.map((d) => [d.date, d])), [plan.offDays]);
  const offDates = useMemo(() => [...offByDate.keys()], [offByDate]);
  const changed = changedDates(original, edited);
  const today = localToday();
  const isLocked = (date: string) => approved && date <= today;
  // A trip that began but hasn't ended: its return date is the one thing that can still move.
  const isOngoingTrip = (date: string) => isLocked(date) && Boolean(edited[date]?.returnDate && edited[date]!.returnDate! > today);
  // A trip needs an out-station route, so the return date is only asked for once one is ticked.
  const hasOutStation = routes.some((r) => r.routeType === 'OUT_STATION' && form.routeIds.includes(r.id));
  const withRoutes = (f: DraftDay, routeIds: string[]): DraftDay =>
    routes.some((r) => r.routeType === 'OUT_STATION' && routeIds.includes(r.id)) ? { ...f, routeIds } : { ...f, routeIds, returnDate: null };
  const returnOnly = editing !== null && isLocked(editing);

  function open(date: string) {
    setForm(edited[date] ?? EMPTY_DAY);
    setFormError(undefined);
    setTripConfirm(null);
    setEditing(date);
  }

  /** The open day as the form has it, or what is wrong with it. */
  function resolveDay(date: string): { day: DraftDay; problem: string | null } {
    const day: DraftDay = returnOnly ? { ...edited[date]!, returnDate: form.returnDate || null } : { ...form, returnDate: form.returnDate || null };
    const problem =
      returnOnly && (!day.returnDate || day.returnDate <= today)
        ? 'The new return date has to be after today.'
        : dayProblem(day, date, { routes, edited, offDates });
    return { day, problem };
  }

  function applyDay() {
    if (!editing) return;
    const { day, problem } = resolveDay(editing);
    setFormError(problem ?? undefined);
    if (problem) return;
    setEdited((e) => withDay(e, editing, day));
    setEditing(null);
  }

  function clearDay() {
    if (!editing) return;
    setEdited((e) => withDay(e, editing, null));
    setEditing(null);
  }

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  /** The trips this save sets up or moves, as lines to confirm: every changed day with a return date. */
  const tripsToConfirm = (days: Record<string, DraftDay>, changedOn: string[]) =>
    changedOn.flatMap((date) => {
      const day = days[date];
      if (!day?.returnDate || day.returnDate === original[date]?.returnDate) return [];
      const names = routes.filter((r) => r.routeType === 'OUT_STATION' && day.routeIds.includes(r.id)).map((r) => r.name);
      return [{ date, lines: tripLines(date, day.returnDate, names) }];
    });

  function submit(confirmed = false) {
    const problem = reason.length > REASON_MAX ? `At most ${REASON_MAX} characters.` : undefined;
    setReasonError(problem);
    if (problem) return;
    // A day still open in the form is part of what the person is saving: apply it first rather than dropping it.
    let days = edited;
    if (editing) {
      const { day, problem: dayError } = resolveDay(editing);
      setFormError(dayError ?? undefined);
      if (dayError) return;
      days = withDay(edited, editing, day);
      setEdited(days);
      setEditing(null);
    }
    const changedOn = changedDates(original, days);
    if (changedOn.length === 0) {
      setReasonError('Nothing was changed yet.');
      return;
    }
    const trips = tripsToConfirm(days, changedOn);
    if (trips.length > 0 && !confirmed) {
      setTripConfirm(trips);
      return;
    }
    setTripConfirm(null);
    amend.mutate(
      { entries: amendEntries(days), reason: reason.trim() },
      // A 409 "changed while you were amending": the server's plan moved on, so close and let the screen reload it.
      { onError: (err) => err instanceof ApiError && err.status === 409 && /changed while/i.test(err.message) && setStale(true) },
    );
  }

  return (
    <FormDialog
      wide
      title="Edit the monthly plan"
      description={
        approved
          ? 'Change the days after today. The plan stays approved, the old days are kept on it, and the employee is told. Today and earlier days are locked.'
          : 'Change any day before you decide. The plan keeps waiting for you, the old days are kept on it, and the employee is told.'
      }
      formId="amend-monthly-plan-form"
      pending={amend.isPending}
      disabled={stale || ownerRoutes.isLoading}
      onClose={onClose}
      onSubmit={() => submit(tripConfirm !== null)}
    >
      {stale ? (
        <p role="alert" className="rounded-md border border-border bg-surface-hover p-3 text-sm text-text">
          The plan changed while you were editing it. Close this and open it again to start from the latest version.
        </p>
      ) : null}
      <ol className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded-md border border-border">
        {datesOf(plan.planMonth).map((date) => {
          const off = offByDate.get(date);
          const day = edited[date];
          const wasChanged = changed.includes(date);
          return (
            <li key={date} className="px-4 py-3">
              <div className="grid items-start gap-3 sm:grid-cols-[7rem_1fr_auto]">
                <p className="text-sm font-medium tabular-nums text-text">{planDayLabel(date)}</p>
                <div className="space-y-1.5">
                  {off ? <Badge tone="neutral">{offDayLabel(off)}</Badge> : null}
                  {day ? (
                    <>
                      {isTripDay(day.dayKind) ? <Badge tone="neutral">{DAY_KIND_LABEL[day.dayKind as 'STAY' | 'TRANSIT']} · part of a trip</Badge> : <PlanDayView day={day} />}
                    </>
                  ) : !off ? (
                    <p className="text-sm text-text-subtle">Not planned</p>
                  ) : null}
                  {wasChanged ? <Badge tone="warning">Changed</Badge> : null}
                </div>
                {!off && !(day && isTripDay(day.dayKind)) ? (
                  isLocked(date) && !isOngoingTrip(date) ? (
                    <Badge tone="neutral">Locked</Badge>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={() => open(date)} aria-label={`${isOngoingTrip(date) ? 'Change return for' : day ? 'Edit' : 'Plan'} ${planDayLabel(date)}`}>
                      {isOngoingTrip(date) ? 'Change return' : day ? 'Edit' : 'Plan'}
                    </Button>
                  )
                ) : null}
              </div>
              {editing === date ? (
                <div className="mt-3 space-y-3 rounded-md border border-border bg-surface-hover/60 p-4">
                  {returnOnly ? (
                    <FormField label="Return date (trip)" htmlFor="amend-return" hint="The trip has begun, so only its return date can change. The days up to today stay as they are.">
                      <Input id="amend-return" type="date" className="w-44" min={nextDay(today)} value={form.returnDate ?? ''} onChange={(e) => setForm((f) => ({ ...f, returnDate: e.target.value || null }))} />
                    </FormField>
                  ) : null}
                  {!returnOnly ? (
                    <>
                  <FormField label="Working type" htmlFor="amend-type">
                    <Select
                      id="amend-type"
                      value={form.workingType}
                      options={TYPE_OPTIONS}
                      onValueChange={(v) => setForm((f) => clearedForType({ ...f, workingType: v as WorkingType }))}
                    />
                  </FormField>
                  {isFieldDay(form.workingType) ? (
                    <>
                  <fieldset className="space-y-1.5">
                    <legend className="text-sm font-medium text-text">Routes</legend>
                    {routes.length === 0 ? <p className="text-sm text-text-subtle">{ownerRoutes.isLoading ? 'Loading…' : 'This employee has no routes.'}</p> : null}
                    <div className="grid gap-1 sm:grid-cols-2">
                      {routes.map((r) => (
                        <label key={r.id} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={form.routeIds.includes(r.id)} onChange={() => setForm((f) => withRoutes(f, toggle(f.routeIds, r.id)))} />
                          {r.name}
                          <span className="text-text-subtle">({ROUTE_TYPE_LABEL[r.routeType]})</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium text-text">Works with</p>
                    {form.workWith.length > 0 ? (
                      <ul className="flex flex-wrap gap-2">
                        {form.workWith.map((id) => (
                          <li key={id} className="flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-sm">
                            <WorkWithName userId={id} />
                            <button type="button" className="text-text-subtle hover:text-text" aria-label="Remove" onClick={() => setForm((f) => ({ ...f, workWith: toggle(f.workWith, id) }))}>
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <EmployeePickerField
                      id="amend-work-with"
                      label="Add a colleague"
                      title="Works with"
                      value=""
                      selfId={plan.userId}
                      hint="Only people in the employee’s team can be added; the server checks."
                      onChange={(id) => id && setForm((f) => ({ ...f, workWith: f.workWith.includes(id) ? f.workWith : [...f.workWith, id] }))}
                    />
                  </div>
                  {hasOutStation ? (
                    <FormField label="Return date (trip)" htmlFor="amend-return" hint="Leave empty for a same-day return. The days between become stay days, and the return day is the way back.">
                      <Input id="amend-return" type="date" className="w-44" min={nextDay(date)} value={form.returnDate ?? ''} onChange={(e) => setForm((f) => ({ ...f, returnDate: e.target.value || null }))} />
                    </FormField>
                  ) : null}
                    </>
                  ) : (
                    <p className="text-sm text-text-subtle">Routes and “Work with” are only picked for Field work and Doctor campaign days.</p>
                  )}
                  <FormField label="Remarks" htmlFor="amend-remarks">
                    <Textarea id="amend-remarks" maxLength={500} value={form.remarks ?? ''} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
                  </FormField>
                    </>
                  ) : null}
                  {formError ? (
                    <p role="alert" className="text-[13px] text-danger-fg">
                      {formError}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={applyDay}>
                      Apply to this day
                    </Button>
                    {day && !returnOnly ? (
                      <Button size="sm" variant="secondary" onClick={clearDay}>
                        Remove this day
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {tripConfirm ? (
        <div role="alert" className="space-y-2 rounded-md border border-border bg-surface-hover p-3 text-sm">
          <p className="font-medium text-text">Please check the trip{tripConfirm.length === 1 ? '' : 's'} before saving</p>
          {tripConfirm.map((t) => (
            <ul key={t.date} className="list-disc space-y-0.5 pl-5 text-text-muted">
              {t.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ))}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => submit(true)} disabled={amend.isPending}>
              Yes, save this
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setTripConfirm(null)}>
              Go back
            </Button>
          </div>
        </div>
      ) : null}
      <FormField
        label="Reason (optional)"
        htmlFor="amend-reason"
        error={reasonError}
        hint={`Optional; the employee sees it. ${changed.length === 0 ? 'No days changed yet.' : `${changed.length} day${changed.length === 1 ? '' : 's'} changed.`}`}
      >
        <Textarea id="amend-reason" value={reason} maxLength={REASON_MAX} onChange={(e) => setReason(e.target.value)} aria-invalid={reasonError ? true : undefined} />
      </FormField>
    </FormDialog>
  );
}
