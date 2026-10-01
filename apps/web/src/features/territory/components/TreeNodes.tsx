'use client';

import type { AreaDto, HqDto, ZoneDto } from '@greynote/contracts';
import { Building2, Map as MapIcon, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { TreeItem } from '@/components/ui/Tree';
import { useAreas } from '../hooks/useAreas';
import { useHqs } from '../hooks/useHqs';
import { AREA_TYPE_LABEL } from '../lib/draft';
import { BranchStatus } from './BranchStatus';
import { RowActions } from './RowActions';
import { useTerritoryTree } from './TerritoryTreeContext';

const PAGE = 100;

function InactiveBadge({ status }: { status: string }) {
  return status === 'inactive' ? <Badge>Inactive</Badge> : null;
}

/** An area: the leaf. (Routes will hang under it as one more node component.) */
export function AreaLeaf({ area }: { area: AreaDto }) {
  const t = useTerritoryTree();
  return (
    <TreeItem
      id={area.id}
      parentId={area.hqId}
      level={3}
      expanded={undefined}
      icon={<MapPin className="size-4" />}
      label={area.name}
      badges={
        <>
          <Badge tone="accent">{AREA_TYPE_LABEL[area.type]}</Badge>
          <InactiveBadge status={area.status} />
        </>
      }
      actions={
        <RowActions
          label={area.name}
          status={area.status}
          disabled={t.readOnly}
          onEdit={() => t.edit.area(area)}
          onToggleStatus={() => t.toggleStatus.area(area)}
        />
      }
    />
  );
}

/** An HQ. Loads its areas only once opened. */
export function HqNode({ hq }: { hq: HqDto }) {
  const t = useTerritoryTree();
  const expanded = t.isExpanded(hq.id);
  const areas = useAreas(
    { page: 1, pageSize: PAGE, hqId: hq.id, ...(!t.showInactive && { status: 'active' as const }) },
    { enabled: expanded },
  );

  return (
    <TreeItem
      id={hq.id}
      parentId={hq.zoneId}
      level={2}
      expanded={expanded}
      onToggle={() => t.toggle(hq.id)}
      icon={<Building2 className="size-4" />}
      label={hq.name}
      badges={<InactiveBadge status={hq.status} />}
      actions={
        <RowActions
          label={hq.name}
          status={hq.status}
          disabled={t.readOnly}
          onEdit={() => t.edit.hq(hq)}
          onToggleStatus={() => t.toggleStatus.hq(hq)}
          extraItems={hq.status === 'active' ? [{ label: 'Add area', onSelect: () => t.addArea(hq.id) }] : []}
        />
      }
    >
      <BranchStatus level={3} query={areas} noun="areas" onAdd={() => t.addArea(hq.id)} addDisabled={t.readOnly || hq.status !== 'active'} />
      {areas.data?.items.map((area) => <AreaLeaf key={area.id} area={area} />)}
    </TreeItem>
  );
}

/** A zone. Loads its HQs only once opened. */
export function ZoneNode({ zone }: { zone: ZoneDto }) {
  const t = useTerritoryTree();
  const expanded = t.isExpanded(zone.id);
  const hqs = useHqs(
    { page: 1, pageSize: PAGE, zoneId: zone.id, ...(!t.showInactive && { status: 'active' as const }) },
    { enabled: expanded },
  );

  return (
    <TreeItem
      id={zone.id}
      parentId={null}
      level={1}
      expanded={expanded}
      onToggle={() => t.toggle(zone.id)}
      icon={<MapIcon className="size-4" />}
      label={zone.name}
      badges={<InactiveBadge status={zone.status} />}
      actions={
        <RowActions
          label={zone.name}
          status={zone.status}
          disabled={t.readOnly}
          onEdit={() => t.edit.zone(zone)}
          onToggleStatus={() => t.toggleStatus.zone(zone)}
          extraItems={zone.status === 'active' ? [{ label: 'Add HQ', onSelect: () => t.addHq(zone.id) }] : []}
        />
      }
    >
      <BranchStatus level={2} query={hqs} noun="HQs" onAdd={() => t.addHq(zone.id)} addDisabled={t.readOnly || zone.status !== 'active'} />
      {hqs.data?.items.map((hq) => <HqNode key={hq.id} hq={hq} />)}
    </TreeItem>
  );
}
