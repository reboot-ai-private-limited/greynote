export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 p-10 text-center">
      <h2 className="font-medium">{title}</h2>
      {description ? <p className="max-w-md text-sm text-text-subtle">{description}</p> : null}
    </div>
  );
}
