import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

export const fieldClass = cn(
  'w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text',
  'placeholder:text-text-subtle transition-shadow',
  'focus-visible:border-accent focus-visible:shadow-focus focus-visible:outline-none',
  'disabled:cursor-not-allowed disabled:bg-surface-subtle',
  'aria-[invalid=true]:border-danger',
);

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClass, 'h-10', className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldClass, 'min-h-24 py-2', className)} {...props} />;
}
