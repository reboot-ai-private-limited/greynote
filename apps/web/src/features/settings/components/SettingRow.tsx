'use client';

import type { ConfigSettingDto } from '@greynote/contracts';
import { useId, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmployeeName } from '@/features/people/components/EmployeePickerField';
import { formatDateTime } from '@/lib/format';
import { useUpdateSetting } from '../hooks/useSettings';
import { canSave, confirmCopy, displayValue, draftError, isChanged, isDefaultDraft, rangeHint, valueToDraft } from '../lib/settings';
import { SettingControl } from './SettingControl';

/**
 * One setting: its name and meaning, a control for its type, and Save. Saved on its own, never automatically. A high-impact setting says
 * what moves and asks first; the server's own message is shown beside the control if it disagrees with the quick check.
 */
export function SettingRow({ setting, readOnly }: { setting: ConfigSettingDto; readOnly: boolean }) {
  const hintId = useId();
  const [draft, setDraft] = useState(valueToDraft(setting));
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // What the form is for: the value being saved. Reset saves the default through the same path, with the same confirmation.
  const [saving, setSaving] = useState<string | null>(null);
  const save = useUpdateSetting(setting.key, setting.label, () => {
    setConfirming(false);
    setSaving(null);
    setServerError(null);
  });

  // The quick check speaks only once the value has been touched: an untouched invalid stored value is already explained by the banner above the control.
  const changed = isChanged(setting, draft);
  const quickError = changed ? draftError(setting, draft) : undefined;
  const copy = confirmCopy(setting, saving ?? draft);

  function start(value: string) {
    setServerError(null);
    setSaving(value);
    if (confirmCopy(setting, value)) setConfirming(true);
    else send(value);
  }
  function send(value: string) {
    save.mutate(value, {
      onError: (error) => {
        setConfirming(false);
        setServerError(error.message);
      },
    });
  }

  return (
    <li className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_auto] lg:items-start">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium text-text">{setting.label}</h3>
          {setting.impact === 'HIGH' ? <Badge tone="warning">High impact</Badge> : null}
          {!setting.isDefault ? <Badge tone="accent">Changed from default</Badge> : null}
          {!setting.valid ? <Badge tone="danger">Invalid value</Badge> : null}
        </div>
        <p className="text-[13px] text-text-muted">{setting.description}</p>
        <p id={hintId} className="text-xs text-text-subtle">
          {rangeHint(setting)} · default {displayValue(setting, setting.default)}
          {setting.updatedBy ? (
            <>
              {' '}· last changed by <EmployeeName userId={setting.updatedBy} /> on {formatDateTime(setting.updatedAt)}
            </>
          ) : null}
        </p>
        {!setting.valid && setting.invalidReason ? (
          <p role="alert" className="rounded-md border border-danger bg-danger-bg px-3 py-2 text-[13px] text-danger-fg">
            The stored value is “{setting.value}”. {setting.invalidReason} The system fails whenever it reads this setting: save a valid value.
          </p>
        ) : null}
      </div>

      <div className="space-y-2 lg:w-80">
        <SettingControl setting={setting} draft={draft} onChange={(v) => { setDraft(v); setServerError(null); }} disabled={readOnly || save.isPending} invalid={Boolean(quickError || serverError)} describedBy={hintId} />
        {quickError || serverError ? (
          <p role="alert" className="text-[13px] text-danger-fg">
            {serverError ?? quickError}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={readOnly || save.isPending || !canSave(setting, draft)} title={readOnly ? 'A past financial year is read-only' : undefined} onClick={() => start(draft)}>
            {save.isPending && saving === draft ? 'Saving…' : 'Save'}
          </Button>
          {changed ? (
            <Button size="sm" variant="ghost" disabled={save.isPending} onClick={() => { setDraft(valueToDraft(setting)); setServerError(null); }}>
              Discard
            </Button>
          ) : null}
          {!setting.isDefault && !isDefaultDraft(setting, draft) ? (
            <Button size="sm" variant="ghost" disabled={readOnly || save.isPending} onClick={() => { setDraft(setting.default); start(setting.default); }}>
              Reset to default
            </Button>
          ) : null}
        </div>
      </div>

      {copy ? (
        <ConfirmDialog
          open={confirming}
          onOpenChange={(open) => { if (!open && !save.isPending) { setConfirming(false); setSaving(null); } }}
          title={copy.title}
          description={copy.change}
          confirmLabel={copy.confirm}
          pending={save.isPending}
          onConfirm={() => saving !== null && send(saving)}
        >
          {copy.note ? <p className="text-sm text-text-muted">{copy.note}</p> : null}
        </ConfirmDialog>
      ) : null}
    </li>
  );
}
