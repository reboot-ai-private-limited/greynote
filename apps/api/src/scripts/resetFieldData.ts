/** Approval kinds whose requests (and the records behind them) the reset removes. */
export const RESET_APPROVAL_KINDS = ['DAILY_PLAN', 'DCR', 'MONTHLY_PLAN', 'EXPENSE_MONTH', 'SECONDARY_SALES', 'LEAVE', 'NEW_DOCTOR', 'DOCTOR_SERVICE'] as const;

/** Collections emptied outright, records first and routes last: nothing is left pointing at a route that is gone. */
export const RESET_COLLECTIONS = [
  'approvalrequests',
  'dailyplans',
  'monthlyplans',
  'latesubmitgrants',
  'dcrs',
  'doctorcalls',
  'chemistcalls',
  'followups',
  'expenses',
  'expensemonths',
  'expenseadjustments',
  'expensemonthgrants',
  'employeesales',
  'leaves',
  'leavebalances',
  'doctorservices',
  'doctorgifts',
  'sampleallocations',
  'doctorassignments',
  'doctorvisuals',
  'doctorarchives',
  'doctors',
  'chemists',
  'routeassignments',
  'routes',
  'syncreceipts',
  'syncdrafts',
  'remindermarks',
  'teamalertmarks',
] as const;

/** Collections that are only partly cleared, so they get a filter. */
export const RESET_FILTERED: ReadonlyArray<{ collection: string; filter: Record<string, unknown> }> = [
  { collection: 'territoryarchives', filter: { kind: 'ROUTE' } },
];

interface WithFiles {
  attachments?: ReadonlyArray<{ publicId?: string }>;
  photo?: { publicId?: string } | null;
}

/** Every Cloudinary public id on the given leave / expense / doctor documents, once each. */
export function collectPublicIds(docs: readonly WithFiles[]): string[] {
  const ids = new Set<string>();
  for (const d of docs) {
    for (const a of d.attachments ?? []) if (a.publicId) ids.add(a.publicId);
    if (d.photo?.publicId) ids.add(d.photo.publicId);
  }
  return [...ids];
}

/** The database name in a Mongo connection string, or null when it has none. */
export function databaseName(uri: string): string | null {
  const m = /^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/.exec(uri);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

/** Why `--apply` must not run, or null when it may. */
export function refusalReason(facts: { mongoUri: string; confirmDb: string | undefined }): string | null {
  const name = databaseName(facts.mongoUri);
  if (!name) return 'MONGO_URI has no database name. Add one, e.g. .../greynote?...';
  if (!facts.confirmDb) return `Pass --confirm-db=${name} to say this is the database you mean.`;
  if (facts.confirmDb !== name) return `--confirm-db=${facts.confirmDb} does not match the database in MONGO_URI (${name}).`;
  return null;
}
