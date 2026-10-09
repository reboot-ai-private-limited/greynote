'use client';

import Link from 'next/link';
import type { FormEvent, ReactNode } from 'react';
import { Button } from './Button';
import { Card } from './Card';
import { Stepper, type StepperItem } from './Stepper';
import { StepFrame } from './WizardParts';

/**
 * The frame an "add one" wizard shares with the employee wizard: a back link, the page title, the step bar, one card holding the current
 * step, and a footer with Back and Next (Create on the last step). Enter inside a field means Next, because Next is the form's submit button;
 * Next and Create are separate elements so the click that moves to the last step cannot also create the record.
 */
export function WizardShell({
  backHref,
  backLabel,
  title,
  steps,
  current,
  onSelect,
  stepTitle,
  onSubmit,
  onBack,
  backText,
  isLast,
  createLabel,
  pending = false,
  disabled = false,
  disabledTitle,
  children,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  steps: readonly StepperItem[];
  current: string;
  onSelect: (key: string) => void;
  stepTitle: string;
  onSubmit: () => void;
  onBack: () => void;
  /** "Back" after the first step, "Cancel" on it. */
  backText: string;
  isLast: boolean;
  createLabel: string;
  pending?: boolean;
  disabled?: boolean;
  disabledTitle?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <p className="mb-2 text-sm">
        <Link href={backHref} className="text-text-muted hover:text-accent hover:underline">
          ← {backLabel}
        </Link>
      </p>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-text">{title}</h1>
      <div className="mb-6">
        <Stepper steps={steps} current={current} onSelect={onSelect} />
      </div>
      <form
        noValidate
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <Card>
          <div className="p-6">
            <StepFrame title={stepTitle}>{children}</StepFrame>
          </div>
          <footer className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
            <Button variant="secondary" onClick={onBack}>
              {backText}
            </Button>
            {isLast ? (
              <Button
                key="create"
                type="submit"
                disabled={disabled || pending}
                title={disabledTitle}
              >
                {pending ? 'Saving…' : createLabel}
              </Button>
            ) : (
              <Button key="next" type="submit" disabled={disabled}>
                Next
              </Button>
            )}
          </footer>
        </Card>
      </form>
    </div>
  );
}
