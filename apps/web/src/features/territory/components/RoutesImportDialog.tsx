'use client';

import { Download } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { toast } from '@/components/ui/toast';
import type { RoutesImportResultDto } from '@/lib/api/endpoints/territory';
import { fileProblem, importProblems } from '@/features/hr/lib/holidayImport';
import { useImportRoutes } from '../hooks/usePlaces';

/** What an Admin can copy into a spreadsheet and fill in. An empty from_place is the HQ town; an empty to_hq is the from HQ. */
export const ROUTES_CSV_TEMPLATE =
  'from_hq,from_place,to_hq,to_place,km,to_type,ta_rate,ta_fixed\n' +
  'SILIGURI,,,Naxalbari,25,EX,,\n' +
  'SILIGURI,,JALPAIGURI,Mainaguri,65,EX,,\n' +
  'JALPAIGURI,Mainaguri,,Dhupguri,25,OUT,,350\n';

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([ROUTES_CSV_TEMPLATE], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'routes-template.csv';
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Admin: many Place ↔ Place routes from one CSV (2026-11-26) — a manager over many HQs needs a route for every trip
 * they plan. Choosing a file checks it without saving; only then can it be imported. One bad line refuses the whole file.
 */
export function RoutesImportDialog({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<RoutesImportResultDto | null>(null);
  const [problems, setProblems] = useState<Array<{ line: number; message: string }>>([]);
  const run = useImportRoutes((result) => {
    toast.success(`${result.created.routes.length} route${result.created.routes.length === 1 ? '' : 's'} added${result.existing.routes ? `, ${result.existing.routes} already there` : ''}.`);
    onClose();
  });

  function choose(next: File | undefined) {
    setPreview(null);
    setProblems([]);
    if (!next) return setFile(null);
    const refused = fileProblem(next);
    if (refused) {
      setFile(null);
      return setProblems([{ line: 0, message: refused }]);
    }
    setFile(next);
    run.mutate({ file: next, dryRun: true }, { onSuccess: setPreview, onError: (e) => setProblems(importProblems(e)) });
  }

  const nothingNew = preview !== null && preview.created.routes.length === 0;
  return (
    <Dialog
      open
      wide
      onOpenChange={(open) => !open && onClose()}
      title="Upload routes"
      description="Columns: from_hq, from_place (empty = the HQ town), to_hq (empty = the same HQ), to_place, km (one way). Optional: to_type / from_type (HQ, EX or OUT) to create a place that isn't there yet, ta_rate (₹ per km) or ta_fixed (₹ for the day). A route already there with the same km is skipped."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!file || !preview || nothingNew || run.isPending} onClick={() => file && run.mutate({ file, dryRun: false })}>
            {run.isPending && !run.variables?.dryRun ? 'Importing…' : preview ? `Import ${preview.created.routes.length}` : 'Import'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input type="file" accept=".csv,text/csv" aria-label="Routes CSV file" className="text-sm" onChange={(e) => choose(e.target.files?.[0])} />
          <Button variant="ghost" size="sm" onClick={downloadTemplate}>
            <Download aria-hidden className="size-4" /> Template
          </Button>
        </div>
        {run.isPending && run.variables?.dryRun ? <p className="text-sm text-text-muted">Checking the file…</p> : null}
        {problems.length > 0 ? (
          <div role="alert" className="rounded-md border border-danger-border bg-danger-bg p-3 text-sm text-danger-fg">
            <p className="font-medium">Nothing was imported. Fix these and choose the file again:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {problems.map((p) => (
                <li key={`${p.line}-${p.message}`}>
                  {p.line > 0 ? `Line ${p.line}: ` : ''}
                  {p.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {preview ? (
          <div className="space-y-2 text-sm">
            <p className="text-text-muted">
              {preview.created.routes.length} route{preview.created.routes.length === 1 ? '' : 's'} to add
              {preview.created.places.length ? `, ${preview.created.places.length} new place${preview.created.places.length === 1 ? '' : 's'}` : ''}
              {preview.existing.routes ? `, ${preview.existing.routes} already there (skipped)` : ''}.
            </p>
            {preview.created.places.length ? <p className="text-text-muted">New places: {preview.created.places.join(', ')}</p> : null}
            <ul className="max-h-64 list-disc overflow-auto rounded-md border border-border py-2 pl-8 pr-3">
              {preview.created.routes.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
