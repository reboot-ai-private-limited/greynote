import type { DcrDetailDto, DcrExpenseDto, DoctorCallDto, GeofenceOutcomeDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import {
  approveWarnings,
  canOverride,
  claimedTotalPaise,
  dcrCounts,
  dcrCountsLabel,
  flaggedCalls,
  flaggedNotice,
  formatMeters,
  geofenceDetail,
  hasDistanceFlag,
  isFlagged,
  overrideReasonError,
  splitExpenses,
  taDaNote,
} from './review';

const geo = (over: Partial<GeofenceOutcomeDto> = {}): GeofenceOutcomeDto => ({
  status: 'PASS',
  distanceMeters: 40,
  reason: null,
  overriddenBy: null,
  overriddenAt: null,
  overrideComment: null,
  ...over,
});
const call = (id: string, g: GeofenceOutcomeDto, samples: DoctorCallDto['samples'] = []): DoctorCallDto => ({
  id,
  dcrId: 'd',
  userId: 'u',
  reportDate: '2026-10-05',
  workingType: 'FIELD_WORK',
  workWith: [],
  remarks: null,
  capturedLocation: null,
  accuracyMeters: null,
  geofence: g,
  recordedAt: '2026-10-05T05:00:00Z',
  doctorId: 'doc',
  doctorName: 'Dr Rao',
  samples,
});
const expense = (over: Partial<DcrExpenseDto>): DcrExpenseDto => ({
  id: 'e',
  type: 'MEAL',
  source: 'MANUAL',
  amountPaise: 10_000,
  remarks: null,
  paymentStatus: 'UNPAID',
  accepted: false,
  distanceFlag: false,
  routeId: null,
  ...over,
});

describe('formatMeters', () => {
  it('uses metres under a kilometre and kilometres above', () => {
    expect(formatMeters(84.6)).toBe('85 m');
    expect(formatMeters(1234)).toBe('1.2 km');
    expect(formatMeters(42_000)).toBe('42 km');
  });
});

describe('geofenceDetail', () => {
  it('gives the distance for a pass and a fail', () => {
    expect(geofenceDetail(geo())).toBe('40 m from the registered location.');
    expect(geofenceDetail(geo({ status: 'FAIL', distanceMeters: 2500 }))).toBe('2.5 km from the registered location, beyond the allowed radius.');
  });
  it('gives the reason for an unverified call', () => {
    expect(geofenceDetail(geo({ status: 'UNVERIFIED', distanceMeters: null, reason: 'NO_GPS_READING' }))).toBe('The phone got no GPS reading.');
    expect(geofenceDetail(geo({ status: 'UNVERIFIED', distanceMeters: null, reason: 'NO_REGISTERED_LOCATION' }))).toMatch(/no registered location/);
    expect(geofenceDetail(geo({ status: 'UNVERIFIED', distanceMeters: null, reason: null }))).toBe('The location could not be checked.');
  });
  it('keeps what was found beside an acceptance, with the reason given', () => {
    expect(geofenceDetail(geo({ status: 'OVERRIDE', distanceMeters: 900, overrideComment: 'Clinic moved' }))).toBe('Accepted: “Clinic moved”. It was 900 m away.');
    expect(geofenceDetail(geo({ status: 'OVERRIDE', distanceMeters: null, reason: 'LOW_ACCURACY', overrideComment: 'Basement clinic' }))).toMatch(/Accepted: “Basement clinic”\. The GPS reading was too weak/);
  });
});

describe('flagged calls', () => {
  const dcr = {
    doctorCalls: [call('a', geo()), call('b', geo({ status: 'FAIL' })), call('c', geo({ status: 'OVERRIDE' }))],
    chemistCalls: [{ ...call('x', geo({ status: 'UNVERIFIED' })), chemistId: 'ch', chemistName: 'Apollo' }],
  };
  it('is a call the check flagged and nobody has accepted', () => {
    expect(isFlagged(call('a', geo()))).toBe(false);
    expect(isFlagged(call('b', geo({ status: 'FAIL' })))).toBe(true);
    expect(isFlagged(call('c', geo({ status: 'OVERRIDE' })))).toBe(false);
  });
  it('lists the doctor and chemist calls still flagged, and says how many', () => {
    expect(flaggedCalls(dcr).map((c) => c.id)).toEqual(['b', 'x']);
    expect(flaggedNotice(dcr)).toBe('2 calls were flagged by the location check and have not been accepted.');
    expect(flaggedNotice({ doctorCalls: [call('b', geo({ status: 'FAIL' }))], chemistCalls: [] })).toBe('1 call was flagged by the location check and has not been accepted.');
    expect(flaggedNotice({ doctorCalls: [call('a', geo())], chemistCalls: [] })).toBeNull();
  });
});

describe('canOverride', () => {
  it('is Admin while the report is with the manager or Admin, and never after', () => {
    expect(canOverride('ADMIN', 'SUBMITTED')).toBe(true);
    expect(canOverride('ADMIN', 'MANAGER_APPROVED')).toBe(true);
    expect(canOverride('ADMIN', 'APPROVED')).toBe(false);
    expect(canOverride('ADMIN', 'REJECTED')).toBe(false);
    expect(canOverride('HR', 'SUBMITTED')).toBe(false);
    expect(canOverride(undefined, 'SUBMITTED')).toBe(false);
  });
});

describe('expenses', () => {
  const rows = [
    expense({ id: 'ta', type: 'TA', source: 'AUTO', amountPaise: 617_000 }),
    expense({ id: 'da', type: 'DA', source: 'AUTO', amountPaise: 200_000 }),
    expense({ id: 'm', amountPaise: 15_000 }),
    expense({ id: 'x', amountPaise: 99_000, paymentStatus: 'CANCELLED' }),
  ];
  it('splits the server’s TA and DA from the MR’s claims', () => {
    const { auto, manual } = splitExpenses(rows);
    expect(auto.map((e) => e.id)).toEqual(['ta', 'da']);
    expect(manual.map((e) => e.id)).toEqual(['m', 'x']);
  });
  it('totals what is claimed, leaving out a cancelled row', () => {
    expect(claimedTotalPaise(rows)).toBe(832_000);
    expect(claimedTotalPaise([])).toBe(0);
  });
  it('says TA and DA come when the manager approves, instead of showing nothing', () => {
    expect(taDaNote('SUBMITTED', [expense({})])).toBe('TA and DA are calculated when the manager approves.');
    expect(taDaNote('MANAGER_APPROVED', [expense({})])).toBe('No TA or DA was calculated for this report.');
    expect(taDaNote('MANAGER_APPROVED', rows)).toBeNull();
  });
  it('spots a TA row whose distance could not be calculated', () => {
    expect(hasDistanceFlag(rows)).toBe(false);
    expect(hasDistanceFlag([expense({ distanceFlag: true })])).toBe(true);
  });
});

describe('day at a glance', () => {
  const dcr = {
    doctorCalls: [call('a', geo(), [{ allocationId: 'x', productId: 'p', productName: 'Vit C', quantity: 3 }, { allocationId: 'y', productId: 'q', productName: 'Zinc', quantity: 2 }]), call('b', geo())],
    chemistCalls: [],
    followups: [{ id: 'f', subject: 'DOCTOR' as const, subjectId: 'd', subjectName: 'Dr Rao', remarks: 'x', recordedAt: '' }],
  } satisfies Pick<DcrDetailDto, 'doctorCalls' | 'chemistCalls' | 'followups'>;
  it('counts calls, follow-ups and samples given', () => {
    expect(dcrCounts(dcr)).toEqual({ doctorCalls: 2, chemistCalls: 0, followups: 1, samples: 5 });
  });
  it('says it in words, leaving out what is zero, and says when nothing was logged', () => {
    expect(dcrCountsLabel(dcrCounts(dcr))).toBe('2 doctor calls · 1 follow-up');
    expect(dcrCountsLabel({ doctorCalls: 1, chemistCalls: 1, followups: 0, samples: 0 })).toBe('1 doctor call · 1 chemist call');
    expect(dcrCountsLabel({ doctorCalls: 0, chemistCalls: 0, followups: 0, samples: 0 })).toBe('Nothing was logged on this day.');
  });
});

describe('overrideReasonError', () => {
  it('needs a reason, and caps its length', () => {
    expect(overrideReasonError('')).toBe('Say why the call is accepted.');
    expect(overrideReasonError('   ')).toBe('Say why the call is accepted.');
    expect(overrideReasonError('Clinic moved to a new address')).toBeUndefined();
    expect(overrideReasonError('x'.repeat(501))).toMatch(/500/);
    expect(overrideReasonError('x'.repeat(500))).toBeUndefined();
  });
});

describe('approveWarnings', () => {
  it('is empty when there is nothing to warn about', () => {
    expect(approveWarnings({ skipsManager: false, flagged: 0 })).toEqual([]);
  });
  it('warns about skipping the manager', () => {
    expect(approveWarnings({ skipsManager: true, flagged: 0 })).toEqual(['This is still waiting on the manager. Approving now decides it at once, without them.']);
  });
  it('warns that flagged calls stay unaccepted, in the singular and the plural', () => {
    expect(approveWarnings({ skipsManager: false, flagged: 1 })).toEqual(['1 flagged call has not been accepted. Approving the report does not accept it.']);
    expect(approveWarnings({ skipsManager: false, flagged: 3 })[0]).toBe('3 flagged calls have not been accepted. Approving the report does not accept them.');
  });
  it('gives both, the manager first', () => {
    expect(approveWarnings({ skipsManager: true, flagged: 2 })).toHaveLength(2);
    expect(approveWarnings({ skipsManager: true, flagged: 2 })[0]).toMatch(/waiting on the manager/);
  });
});
