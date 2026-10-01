import type { InputHTMLAttributes } from 'react';
import { cn } from './cn';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-sm',
        'placeholder:text-text-subtle focus:outline-2 focus:outline-accent',
        className,
      )}
      {...props}
    />
  );
}
