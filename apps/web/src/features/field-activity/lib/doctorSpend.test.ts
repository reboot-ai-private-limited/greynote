import { describe, expect, it } from 'vitest';
import { buildGift, buildService, EMPTY_GIFT, EMPTY_SERVICE } from './doctorSpend';

describe('buildService', () => {
  const ok = { doctorId: 'd1', serviceType: 'TOUR_PACKAGE', amount: '2500.50', remarks: '  Goa   conference ' };

  it('builds the body: rupees become paise, remarks are tidied, empty remarks are null', () => {
    expect(buildService(ok)).toEqual({ ok: true, body: { doctorId: 'd1', serviceType: 'TOUR_PACKAGE', amountPaise: 250050, remarks: 'Goa conference' } });
    expect(buildService({ ...ok, remarks: ' ' })).toMatchObject({ ok: true, body: { remarks: null } });
  });
  it('takes only the four service types', () => {
    for (const t of ['TOUR_PACKAGE', 'GIFT', 'ONLINE_PROMOTION', 'OTHERS']) expect(buildService({ ...ok, serviceType: t })).toMatchObject({ ok: true });
    expect(buildService({ ...ok, serviceType: 'HOLIDAY' })).toMatchObject({ ok: false, errors: { serviceType: 'Choose the type of service.' } });
  });
  it('reports every missing field, and refuses a bad or zero amount', () => {
    const result = buildService(EMPTY_SERVICE);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['amount', 'doctorId', 'serviceType']);
    expect(buildService({ ...ok, amount: '0' })).toMatchObject({ ok: false, errors: { amount: 'Must be more than 0.' } });
    expect(buildService({ ...ok, amount: 'abc' })).toMatchObject({ ok: false });
    expect(buildService({ ...ok, remarks: 'x'.repeat(501) })).toMatchObject({ ok: false });
  });
});

describe('buildGift', () => {
  it('builds the body in paise with a tidied name', () => {
    expect(buildGift({ doctorId: 'd1', productName: '  Desk   clock ', amount: '1200' })).toEqual({ ok: true, body: { doctorId: 'd1', productName: 'Desk clock', amountPaise: 120000 } });
  });
  it('reports every missing field, and refuses a zero amount or an over-long name', () => {
    const result = buildGift(EMPTY_GIFT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['amount', 'doctorId', 'productName']);
    expect(buildGift({ doctorId: 'd1', productName: 'x', amount: '0' })).toMatchObject({ ok: false });
    expect(buildGift({ doctorId: 'd1', productName: 'x'.repeat(201), amount: '5' })).toMatchObject({ ok: false });
  });
});
