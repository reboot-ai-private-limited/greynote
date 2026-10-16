import { Schema, model, type Types } from 'mongoose';

export const ARCHIVE_KINDS = ['ZONE', 'HQ', 'ROUTE'] as const;
export type ArchiveKind = (typeof ARCHIVE_KINDS)[number];

/**
 * What a permanently deleted Zone, HQ or Route used to be (decision-log 2026-10-16): the real row is gone, but calls, plans, expenses and
 * reports still hold its id, so this keeps the name and, for a Route, the km and type TA was worked out from. Never edited; one row per deleted item.
 */
export interface TerritoryArchiveDoc {
  kind: ArchiveKind;
  originalId: Types.ObjectId;
  name: string;
  zoneId: Types.ObjectId | null;
  zoneName: string | null;
  hqId: Types.ObjectId | null;
  hqName: string | null;
  routeType: string | null;
  destinationName: string | null;
  distanceKm: Types.Decimal128 | null;
  taPerKmRateOverridePaise: number | null;
  /** All the items deleted by one action share it. */
  batchId: string;
  deletedAt: Date;
  deletedBy: Types.ObjectId;
}

const territoryArchiveSchema = new Schema<TerritoryArchiveDoc>({
  kind: { type: String, required: true, enum: ARCHIVE_KINDS },
  originalId: { type: Schema.Types.ObjectId, required: true, unique: true },
  name: { type: String, required: true },
  zoneId: { type: Schema.Types.ObjectId, default: null },
  zoneName: { type: String, default: null },
  hqId: { type: Schema.Types.ObjectId, default: null },
  hqName: { type: String, default: null },
  routeType: { type: String, default: null },
  destinationName: { type: String, default: null },
  distanceKm: { type: Schema.Types.Decimal128, default: null },
  taPerKmRateOverridePaise: { type: Number, default: null },
  batchId: { type: String, required: true },
  deletedAt: { type: Date, required: true },
  deletedBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
});

export const TerritoryArchiveModel = model<TerritoryArchiveDoc>('TerritoryArchive', territoryArchiveSchema);
