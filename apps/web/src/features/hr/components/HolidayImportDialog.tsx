'use client';

import type { HolidayImportErrorDto, HolidayImportResultDto } from '@greynote/contracts';
import { Download } from 'lucide-react';
import { useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { toast } from '@/components/ui/toast';
import { formatDate } from '@/lib/format';
import { useImportHolidays } from '../hooks/useHolidays';
import { HOLIDAY_SCOPE_LABEL } from '../lib/holidays';
import { HOLIDAY_CSV_TEMPLATE, fileProblem, importProblems } from '../lib/holidayImport';

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([HOLIDAY_CSV_TEMPLATE], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'holidays-template.csv';
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * HR or Admin: add a year's holidays from a CSV. Choosing a file checks it without saving and shows what would be added;
 * only then can it be imported. One bad line refuses the whole file, with every problem listed. Mounted only while open.
 */
export function HolidayImportDialog({ onClose }: { onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<HolidayImportResultDto | null>(null);
  const [problems, setProblems] = useState<HolidayImportErrorDto[]>([]);
  const run = useImportHolidays((result) => {
    toast.success(
      `${result.created} holiday${result.created === 1 ? '' : 's'} added${result.skipped ? `, ${result.skipped} already there` : ''}.`,
    );
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
    run.mutate(
      { file: next, dryRun: true },
      { onSuccess: setPreview, onError: (e) => setProblems(importProblems(e)) },
    );
  }

  const nothingNew = preview !== null && preview.created === 0;
  return (
    <Dialog
      open
      wide
      onOpenChange={(open) => !open && onClose()}
      title="Upload holidays"
      description="One CSV for the whole year. Columns: name, date (YYYY-MM-DD), scope (NATIONAL, ZONE or HQ), zones (names, separated by ;), hqs (Zone/HQ, separated by ;). Holidays already on the calendar are skipped."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!file || !preview || nothingNew || run.isPending}
            onClick={() => file && run.mutate({ file, dryRun: false })}
          >
            {run.isPending && !run.variables?.dryRun
              ? 'Importing…'
              : preview
                ? `Import ${preview.created}`
                : 'Import'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv"
            aria-label="Holiday CSV file"
            className="text-sm"
            onChange={(e) => choose(e.target.files?.[0])}
          />
          <Button variant="ghost" size="sm" onClick={downloadTemplate}>
            <Download aria-hidden className="size-4" /> Template
          </Button>
        </div>

        {run.isPending && run.variables?.dryRun ? (
          <p className="text-sm text-text-muted">Checking the file…</p>
        ) : null}

        {problems.length > 0 ? (
          <div
            role="alert"
            className="rounded-md border border-danger-border bg-danger-bg p-3 text-sm text-danger-fg"
          >
            <p className="font-medium">
              Nothing was imported. Fix these and choose the file again:
            </p>
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
          <div className="space-y-2">
            <p className="text-sm text-text-muted">
              {preview.created} to add
              {preview.skipped ? `, ${preview.skipped} already there (skipped)` : ''}.
            </p>
            <div className="max-h-72 overflow-auto rounded-md border border-border">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-surface text-xs uppercase tracking-wide text-text-subtle">
                  <tr>
                    <th className="px-3 py-2">Line</th>
                    <th className="px-3 py-2">Holiday</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Applies to</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.rows.map((r) => (
                    <tr key={r.line}>
                      <td className="px-3 py-2 text-text-subtle">{r.line}</td>
                      <td className="px-3 py-2 font-medium">{r.name}</td>
                      <td className="px-3 py-2">{formatDate(r.date)}</td>
                      <td className="px-3 py-2 text-text-muted">
                        {[HOLIDAY_SCOPE_LABEL[r.scope], ...r.zones, ...r.hqs].join(' · ')}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Badge tone={r.status === 'NEW' ? 'accent' : 'neutral'}>
                          {r.status === 'NEW' ? 'New' : 'Already there'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
