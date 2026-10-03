'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { generatePassword, secureRandom } from '../lib/user';

/** A password input with Show and Generate, shared by creating an employee and resetting a password. */
export function PasswordField({
  id,
  label,
  hint,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  error?: string | undefined;
  onChange: (value: string) => void;
}) {
  const [reveal, setReveal] = useState(false);
  return (
    <FormField label={label} htmlFor={id} error={error} hint={hint}>
      <div className="flex gap-2">
        <Input
          id={id}
          type={reveal ? 'text' : 'password'}
          autoComplete="new-password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
        />
        <Button variant="secondary" onClick={() => setReveal((r) => !r)} aria-pressed={reveal}>
          {reveal ? 'Hide' : 'Show'}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            onChange(generatePassword(secureRandom));
            setReveal(true);
          }}
        >
          Generate
        </Button>
      </div>
    </FormField>
  );
}
