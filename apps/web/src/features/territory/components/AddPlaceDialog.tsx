'use client';

import { ROUTE_TYPES, type HqDto, type RouteType } from '@greynote/contracts';
import { useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useCreatePlace } from '../hooks/usePlaces';
import { ROUTE_TYPE_LABEL } from '../lib/draft';
import { useStationThresholds } from '../hooks/useStationThresholds';
import { buildNewPlace, typeForKm, type TaMode } from '../lib/routeDraft';
import { RoutePayPreview } from './RoutePayPreview';
import { TaChoiceFields } from './TaChoiceFields';

/**
 * "+ Place" on the Territory page (2026-11-27): a town or station of this HQ with its km from the HQ town and TA — the place and that route
 * in one save. The km is required: it is the route the place is planned by.
 */
export function AddPlaceDialog({ hq, townName, onClose }: { hq: HqDto; townName: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<RouteType | ''>('');
  const [typePicked, setTypePicked] = useState(false);
  const thresholds = useStationThresholds();
  const [distanceKm, setDistanceKm] = useState('');
  const [taMode, setTaMode] = useState<TaMode>('GRADE');
  const [rate, setRate] = useState('');
  const [fixed, setFixed] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreatePlace(onClose);

  function submit() {
    const built = buildNewPlace({ hqId: hq.id, name, type, distanceKm, taMode, rate, fixed });
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    create.mutate(built.body);
  }

  return (
    <FormDialog title={`New place in ${hq.name}`} formId="add-place-form" pending={create.isPending} onClose={onClose} onSubmit={submit}>
      <FormField label="Name" htmlFor="ap-name" error={errors['name']}>
        <Input id="ap-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={errors['name'] ? true : undefined} />
      </FormField>
      <FormField label={`Km from ${townName}`} htmlFor="ap-km" error={errors['distanceKm']} hint="One way, by road.">
        <Input
          id="ap-km"
          inputMode="decimal"
          value={distanceKm}
          onChange={(e) => {
            setDistanceKm(e.target.value);
            setType(typeForKm(e.target.value, thresholds, type, typePicked));
          }}
          aria-invalid={errors['distanceKm'] ? true : undefined}
        />
      </FormField>
      <FormField label="Type" htmlFor="ap-type" error={errors['type']} {...(typePicked ? {} : { hint: 'Set from the km. Change it if needed.' })}>
        <Select
          id="ap-type"
          value={type}
          onValueChange={(v) => {
            setType(v as RouteType);
            setTypePicked(true);
          }}
          placeholder="Choose a type"
          options={ROUTE_TYPES.map((t) => ({ value: t, label: ROUTE_TYPE_LABEL[t] }))}
          aria-invalid={errors['type'] ? true : undefined}
        />
      </FormField>
      <TaChoiceFields idPrefix="ap" taMode={taMode} onTaModeChange={setTaMode} rate={rate} onRateChange={setRate} fixed={fixed} onFixedChange={setFixed} errors={errors} />
      {/* The route it makes stays inside the HQ, so it takes the place's own type. */}
      {type ? (
        <RoutePayPreview
          title={`What a day at ${name.trim() || 'this place'} pays`}
          distanceKm={distanceKm}
          type={type}
          rate={taMode === 'RATE' ? rate : ''}
          fixed={taMode === 'FIXED' ? fixed : ''}
        />
      ) : (
        <p className="text-[13px] text-text-subtle">Enter the km to see what a day here pays.</p>
      )}
    </FormDialog>
  );
}
