'use client';

import { Badge } from '@/components/ui/Badge';
import { Field, FieldList } from '@/components/ui/FieldList';
import { LocationMap } from '@/features/field-master-data/components/LocationMap';
import { useChemist } from '@/features/field-master-data/hooks/useChemists';
import { CHEMIST_STATUS_LABEL, CHEMIST_STATUS_TONE } from '@/features/field-master-data/lib/chemists';
import { formatPoint } from '@/features/field-master-data/lib/location';
import { useTerritoryDirectory } from '@/features/territory/hooks/useTerritoryDirectory';
import { PreviewFrame } from './PreviewFrame';

/** A chemist an employee added: its details, and the location the phone captured. */
export function ChemistPreview({ recordId }: { recordId: string }) {
  const query = useChemist(recordId);
  const directory = useTerritoryDirectory();
  const chemist = query.data;

  return (
    <PreviewFrame title="New chemist" description="Added by an employee. Check the details and the location before approving." query={query}>
      {chemist ? (
        <div className="space-y-5 p-5">
          <FieldList>
            <Field label="Name">{chemist.name}</Field>
            <Field label="Route">{directory.routeLabel(chemist.routeId)}</Field>
            <Field label="Address">{chemist.address}</Field>
            <Field label="Status">
              <Badge tone={CHEMIST_STATUS_TONE[chemist.status]}>{CHEMIST_STATUS_LABEL[chemist.status]}</Badge>
            </Field>
          </FieldList>
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-text-subtle">Location</p>
            <p className="text-sm text-text">
              {chemist.location ? `As the phone captured it: ${formatPoint(chemist.location)}.` : 'No location is set, so the geofence cannot check calls on this chemist.'}
            </p>
            {chemist.location ? <LocationMap point={chemist.location} captured={chemist.capturedLocation} disabled onPick={() => undefined} /> : null}
          </div>
        </div>
      ) : null}
    </PreviewFrame>
  );
}
