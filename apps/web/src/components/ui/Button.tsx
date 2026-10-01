import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-text hover:bg-accent-hover',
  secondary: 'border border-border-strong bg-surface text-text hover:bg-surface-hover',
  ghost: 'text-text-muted hover:bg-surface-hover hover:text-text',
  danger: 'bg-danger text-accent-text hover:opacity-90',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors',
        'focus-visible:shadow-focus focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        sizes[size],
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
