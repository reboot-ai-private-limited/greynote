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
    <div role="alert" className="flex flex-col items-center gap-2 p-10 text-center">
      <h2 className="font-medium">{title}</h2>
      <p className="max-w-md text-sm text-text-subtle">{message}</p>
      {requestId ? <p className="text-xs text-text-subtle">Request ID: {requestId}</p> : null}
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry} className="mt-2">
          Try again
        </Button>
      ) : null}
    </div>
  );
}
