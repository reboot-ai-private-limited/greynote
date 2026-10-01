import { TriangleAlert } from 'lucide-react';
import { Button } from './Button';

export interface ErrorStateProps {
  message: string;
  title?: string;
  /** Quoted to support: ties this screen to the server log line that produced it. */
  requestId?: string;
  onRetry?: () => void;
}

export function ErrorState({ message, title = 'Something went wrong', requestId, onRetry }: ErrorStateProps) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-danger-bg text-danger-fg">
        <TriangleAlert aria-hidden className="size-5" />
      </span>
      <h2 className="mt-1 font-medium text-text">{title}</h2>
      <p className="max-w-md text-sm text-text-muted">{message}</p>
      {requestId ? <p className="text-xs text-text-subtle">Request ID: {requestId}</p> : null}
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-2">
          Try again
        </Button>
      ) : null}
    </div>
  );
}
