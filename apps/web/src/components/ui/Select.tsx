'use client';

import * as RadixSelect from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from './cn';
import { fieldClass } from './Input';

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Radix Select forbids an empty-string item value, so an "any / none" choice is expressed by the
 * caller passing `value=""` (shows the placeholder) and an option such as `{ value: 'all' }`.
 */
export function Select({
  id,
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  'aria-invalid': invalid,
  'aria-label': ariaLabel,
  disabled = false,
}: {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  'aria-invalid'?: boolean | undefined;
  'aria-label'?: string | undefined;
  disabled?: boolean;
}) {
  return (
    <RadixSelect.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <RadixSelect.Trigger
        id={id}
        aria-invalid={invalid}
        aria-label={ariaLabel}
        className={cn(fieldClass, 'inline-flex h-10 items-center justify-between gap-2 text-left')}
      >
        <RadixSelect.Value placeholder={<span className="text-text-subtle">{placeholder}</span>} />
        <RadixSelect.Icon>
          <ChevronDown aria-hidden className="size-4 text-text-subtle" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={4}
          className="z-50 min-w-(--radix-select-trigger-width) overflow-hidden rounded-md border border-border bg-surface shadow-pop"
        >
          <RadixSelect.Viewport className="p-1">
            {options.map((o) => (
              <RadixSelect.Item
                key={o.value}
                value={o.value}
                className="relative flex h-9 cursor-pointer select-none items-center rounded-sm pl-8 pr-3 text-sm text-text outline-none data-[highlighted]:bg-surface-hover"
              >
                <RadixSelect.ItemIndicator className="absolute left-2">
                  <Check aria-hidden className="size-4 text-accent" />
                </RadixSelect.ItemIndicator>
                <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
