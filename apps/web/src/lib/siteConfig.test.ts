import { afterEach, describe, expect, it } from 'vitest';
import { businessTimeZone, financialYearStartMonth, needsReload, resetSiteConfig, setSiteConfig, zoneOffset } from './siteConfig';

afterEach(resetSiteConfig);

describe('the site config', () => {
  it('starts as the server’s own defaults: April and Asia/Kolkata', () => {
    expect(financialYearStartMonth()).toBe(4);
    expect(businessTimeZone()).toBe('Asia/Kolkata');
  });
  it('takes what the server said', () => {
    setSiteConfig({ financialYearStartMonth: 1, businessTimezone: 'Europe/London' });
    expect(financialYearStartMonth()).toBe(1);
    expect(businessTimeZone()).toBe('Europe/London');
  });
  it('ignores a value that is not usable and keeps the one it had', () => {
    setSiteConfig({ financialYearStartMonth: 13, businessTimezone: 'Mars/Olympus' });
    expect(financialYearStartMonth()).toBe(4);
    expect(businessTimeZone()).toBe('Asia/Kolkata');
    setSiteConfig({ financialYearStartMonth: 0, businessTimezone: '' });
    setSiteConfig({ financialYearStartMonth: 4.5, businessTimezone: 'banana' });
    expect(financialYearStartMonth()).toBe(4);
    expect(businessTimeZone()).toBe('Asia/Kolkata');
  });
  it('takes the good half of a half-good answer', () => {
    setSiteConfig({ financialYearStartMonth: 10, businessTimezone: 'Mars/Olympus' });
    expect(financialYearStartMonth()).toBe(10);
    expect(businessTimeZone()).toBe('Asia/Kolkata');
  });
  it('goes back to the defaults on reset', () => {
    setSiteConfig({ financialYearStartMonth: 1, businessTimezone: 'UTC' });
    resetSiteConfig();
    expect(financialYearStartMonth()).toBe(4);
    expect(businessTimeZone()).toBe('Asia/Kolkata');
  });
});

describe('zoneOffset', () => {
  it('gives India’s fixed half-hour offset, summer or winter', () => {
    expect(zoneOffset('2026-01-15', 'Asia/Kolkata')).toBe('+05:30');
    expect(zoneOffset('2026-07-15', 'Asia/Kolkata')).toBe('+05:30');
  });
  it('follows daylight saving: London is +00:00 in winter and +01:00 in summer', () => {
    expect(zoneOffset('2026-01-15', 'Europe/London')).toBe('+00:00');
    expect(zoneOffset('2026-07-15', 'Europe/London')).toBe('+01:00');
  });
  it('handles a negative offset and UTC', () => {
    expect(zoneOffset('2026-01-15', 'America/New_York')).toBe('-05:00');
    expect(zoneOffset('2026-07-15', 'America/New_York')).toBe('-04:00');
    expect(zoneOffset('2026-07-15', 'UTC')).toBe('+00:00');
  });
  it('uses the configured business timezone by default', () => {
    setSiteConfig({ financialYearStartMonth: 4, businessTimezone: 'Europe/London' });
    expect(zoneOffset('2026-07-15')).toBe('+01:00');
  });
});

describe('needsReload', () => {
  it('is true only for the settings that move every date', () => {
    expect(needsReload('FY_START_MONTH')).toBe(true);
    expect(needsReload('BUSINESS_TIMEZONE')).toBe(true);
    expect(needsReload('GEO_FENCE_RADIUS_METERS')).toBe(false);
  });
});
