'use client';

import type { AreaDto, HqDto, ZoneDto } from '@greynote/contracts';
import { createContext, useContext } from 'react';

/**
 * What every node in the tree needs from the screen: expansion state, the "show inactive" filter,
 * the read-only flag, and the actions that open dialogs. Passed by context so a node can be rendered
 * at any depth without threading six props through each level.
 */
export interface TerritoryTree {
  readOnly: boolean;
  showInactive: boolean;
  isExpanded: (id: string) => boolean;
  toggle: (id: string) => void;
  edit: {
    zone: (zone: ZoneDto) => void;
    hq: (hq: HqDto) => void;
    area: (area: AreaDto) => void;
  };
  toggleStatus: {
    zone: (zone: ZoneDto) => void;
    hq: (hq: HqDto) => void;
    area: (area: AreaDto) => void;
  };
  addHq: (zoneId: string) => void;
  addArea: (hqId: string) => void;
}

export const TerritoryTreeContext = createContext<TerritoryTree | null>(null);

export function useTerritoryTree(): TerritoryTree {
  const value = useContext(TerritoryTreeContext);
  if (value === null) throw new Error('useTerritoryTree must be used inside the territory tree');
  return value;
}
