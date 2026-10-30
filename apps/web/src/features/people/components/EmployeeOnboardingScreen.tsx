'use client';

import type { FinalizedEmployeeDto } from '@greynote/contracts';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Stepper } from '@/components/ui/Stepper';
import { toast } from '@/components/ui/toast';
import { istDate } from '@/lib/dates';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import {
  useEmployeeDraft,
  useFinalizeEmployeeDraft,
  useSaveEmployeeDraft,
} from '../hooks/useEmployeeDrafts';
import { useRemoveDraftPhoto, useSetDraftPhoto } from '../hooks/useEmployeeDrafts';
import { usePayComponents } from '../hooks/useCtc';
import { useExtendManagerTerritory } from '@/features/territory/hooks/useManagerCoverage';
import { useAllHqs } from '@/features/territory/hooks/useHqs';
import { useDesignations } from '../hooks/useMasterData';
import {
  EMPTY_FORM,
  STEPS,
  canOpen,
  firstOpenStep,
  fromDraftData,
  stepErrors,
  stepsWithErrors,
  toDraftData,
  type RuleContext,
  type StepKey,
  type WizardForm,
} from '../lib/onboarding';
import { AddressStep } from './onboarding/AddressStep';
import { BankStep } from './onboarding/BankStep';
import { CompensationStep } from './onboarding/CompensationStep';
import { CredentialsCard } from './onboarding/CredentialsCard';
import { PersonalStep } from './onboarding/PersonalStep';
import { PhotoPicker } from './PhotoPicker';
import { ReviewStep } from './onboarding/ReviewStep';
import { ExperienceStep, QualificationsStep } from './onboarding/RowsSteps';
import { WorkStep } from './onboarding/WorkStep';

/**
 * Adding a field employee in one guided pass. A step opens only once the ones before it are valid. Every Next saves the
 * form as a draft, so leaving never loses anything, and the last step creates the login with the next GH id and a
 * generated password.
 */
export function EmployeeOnboardingScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const readOnly = useIsReadOnly();
  const draftParam = params.get('draft');

  const designations = useDesignations();
  const hqs = useAllHqs();
  const loaded = useEmployeeDraft(draftParam);
  const save = useSaveEmployeeDraft();

  const [form, setForm] = useState<WizardForm>(EMPTY_FORM);
  const [step, setStep] = useState<StepKey>('personal');
  const [draftId, setDraftId] = useState<string | null>(draftParam);
  const [tried, setTried] = useState<ReadonlySet<StepKey>>(new Set());
  const [result, setResult] = useState<FinalizedEmployeeDto | null>(null);
  // Set by the pay step when the server refuses the CTC numbers as they stand (e.g. the lines add up to more than the CTC).
  const [ctcProblem, setCtcProblem] = useState<string | null>(null);
  // The draft the form was filled from (or created), so a refetch never overwrites what is being typed.
  const filledFrom = useRef<string | null>(null);

  const extendTerritory = useExtendManagerTerritory();
  // The manager picker's offer (HQ, routes) is applied once the employee exists; it is kept only in this form, never in the draft.
  const finalize = useFinalizeEmployeeDraft((created) => {
    setResult(created);
    if (form.managerId && form.managerExtend)
      extendTerritory.mutate({ managerId: form.managerId, body: form.managerExtend });
  });

  // The saved photo's address, and a file chosen before the draft existed (uploaded as soon as the first save creates it).
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const setDraftPhoto = useSetDraftPhoto();
  const removeDraftPhoto = useRemoveDraftPhoto();

  const payComponents = usePayComponents();
  const orgCodes = useMemo(
    () => (payComponents.data ?? []).map((c) => c.code),
    [payComponents.data],
  );
  const ctx: RuleContext = useMemo(
    () => ({
      designations: designations.data ?? [],
      today: istDate(),
      orgCodes,
      hqs: hqs.data ?? [],
    }),
    [designations.data, orgCodes, hqs.data],
  );
  const index = STEPS.findIndex((s) => s.key === step);

  // Resume: fill the form from the saved draft and open where it left off.
  useEffect(() => {
    const draft = loaded.data;
    if (!draft || filledFrom.current === draft.id || !designations.data) return;
    filledFrom.current = draft.id;
    const restored = fromDraftData(draft.data);
    setForm(restored);
    setDraftId(draft.id);
    setPhotoUrl(draft.data.photoUrl ?? null);
    setStep(firstOpenStep(restored, { designations: designations.data, today: istDate() }));
  }, [loaded.data, designations.data]);

  const update = (patch: Partial<WizardForm>) => setForm((f) => ({ ...f, ...patch }));
  const errors: Record<string, string> = tried.has(step)
    ? {
        ...stepErrors(step, form, ctx),
        ...(step === 'compensation' && ctcProblem ? { ctc: ctcProblem } : {}),
      }
    : {};

  /** Saves the draft (creating it the first time) and keeps the address bar pointing at it. */
  async function persist(upTo: number): Promise<string | null> {
    try {
      const saved = await save.mutateAsync({
        id: draftId,
        body: { step: upTo + 1, data: toDraftData(form, orgCodes) },
      });
      if (!draftId) {
        filledFrom.current = saved.id;
        setDraftId(saved.id);
        router.replace(`/employees/new?draft=${saved.id}`, { scroll: false });
      }
      if (pendingPhoto) {
        const file = pendingPhoto;
        setPendingPhoto(null);
        // A photo that fails to upload must not stop the form being saved: the toast says why, and it can be chosen again.
        await uploadPhoto(saved.id, file);
      }
      return saved.id;
    } catch {
      return null; // the mutation has already shown why
    }
  }

  async function uploadPhoto(id: string, file: File) {
    try {
      setPhotoUrl((await setDraftPhoto.mutateAsync({ id, file })).photoUrl);
    } catch {
      // the mutation has already shown why
    }
  }

  function pickPhoto(file: File) {
    if (draftId) void uploadPhoto(draftId, file);
    else setPendingPhoto(file);
  }

  async function removePhoto() {
    if (pendingPhoto) {
      setPendingPhoto(null);
      return;
    }
    if (!draftId) return;
    try {
      await removeDraftPhoto.mutateAsync(draftId);
      setPhotoUrl(null);
    } catch {
      // the mutation has already shown why
    }
  }

  async function next() {
    const found = stepErrors(step, form, ctx);
    if (Object.keys(found).length > 0 || (step === 'compensation' && ctcProblem)) {
      setTried((t) => new Set(t).add(step));
      return;
    }
    await persist(index + 1);
    setStep(STEPS[index + 1]?.key ?? 'review');
    window.scrollTo({ top: 0 });
  }

  async function saveForLater() {
    if (await persist(index)) {
      toast.success('Draft saved.');
      router.push('/employees');
    }
  }

  async function create() {
    const id = await persist(STEPS.length - 1);
    if (id) finalize.mutate(id);
  }

  const goTo = (key: StepKey) => {
    if (canOpen(key, form, ctx)) setStep(key);
  };
  const back = () => STEPS[index - 1] && setStep(STEPS[index - 1]?.key ?? 'personal');

  if (result) {
    return (
      <CredentialsCard
        name={form.name}
        result={result}
        onOpenProfile={() => router.push(`/employees/${result.userId}`)}
        onAddAnother={() => {
          // A clean slate: the new form, not the one just created.
          filledFrom.current = null;
          setResult(null);
          setForm(EMPTY_FORM);
          setDraftId(null);
          setPhotoUrl(null);
          setPendingPhoto(null);
          setTried(new Set());
          setStep('personal');
          router.replace('/employees/new');
        }}
      />
    );
  }

  const resuming = Boolean(draftParam) && loaded.isLoading;
  const problems = stepsWithErrors(form, ctx);
  const items = STEPS.map((s, i) => ({
    key: s.key,
    label: s.label,
    optional: !s.required,
    // A step ahead counts as done only if it is required and already valid (a resumed draft); optional ones once passed.
    done:
      s.key !== 'review' &&
      Object.keys(stepErrors(s.key, form, ctx)).length === 0 &&
      (s.required ? true : i < index),
    reachable: canOpen(s.key, form, ctx),
  }));
  const busy = save.isPending || finalize.isPending;

  return (
    <div className="mx-auto max-w-3xl">
      <p className="mb-3 text-sm">
        <Link href="/employees" className="text-text-muted hover:text-accent hover:underline">
          ← Employees
        </Link>
      </p>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-text">New employee</h1>

      <div className="mb-6">
        <Stepper steps={items} current={step} onSelect={(key) => goTo(key as StepKey)} />
      </div>

      <Card>
        <div className="p-6">
          {resuming ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <>
              {step === 'personal' ? (
                <PersonalStep
                  form={form}
                  update={update}
                  errors={errors}
                  photo={
                    <PhotoPicker
                      name={form.name}
                      photoUrl={photoUrl}
                      pendingFile={pendingPhoto}
                      busy={setDraftPhoto.isPending || removeDraftPhoto.isPending}
                      disabled={readOnly}
                      onPick={pickPhoto}
                      onRemove={() => void removePhoto()}
                    />
                  }
                />
              ) : null}
              {step === 'address' ? (
                <AddressStep form={form} update={update} errors={errors} />
              ) : null}
              {step === 'qualifications' ? (
                <QualificationsStep form={form} update={update} errors={errors} />
              ) : null}
              {step === 'experience' ? (
                <ExperienceStep form={form} update={update} errors={errors} />
              ) : null}
              {step === 'bank' ? <BankStep form={form} update={update} errors={errors} /> : null}
              {step === 'work' ? <WorkStep form={form} update={update} errors={errors} /> : null}
              {step === 'compensation' ? (
                <CompensationStep
                  form={form}
                  update={update}
                  errors={errors}
                  onProblem={setCtcProblem}
                />
              ) : null}
              {step === 'review' ? (
                <ReviewStep form={form} problems={problems} onEdit={(key) => setStep(key)} />
              ) : null}
            </>
          )}
        </div>
        <footer className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
          <Button variant="secondary" onClick={back} disabled={index === 0 || busy}>
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => void saveForLater()} disabled={busy || readOnly}>
              Save draft
            </Button>
            {step === 'review' ? (
              <Button
                onClick={() => void create()}
                disabled={busy || readOnly || problems.length > 0}
                title={readOnly ? 'A past financial year is read-only' : undefined}
              >
                {finalize.isPending ? 'Creating…' : 'Create employee'}
              </Button>
            ) : (
              <Button onClick={() => void next()} disabled={busy}>
                Next
              </Button>
            )}
          </div>
        </footer>
      </Card>
    </div>
  );
}
