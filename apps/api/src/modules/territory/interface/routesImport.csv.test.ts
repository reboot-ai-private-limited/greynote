import { describe, expect, it } from 'vitest';
import { readRoutesCsv } from './routesImport.csv.js';

describe('readRoutesCsv', () => {
  it('reads places, km, types and the TA columns in rupees; an empty to_hq is the from HQ', () => {
    const csv = 'from_hq,from_place,to_hq,to_place,km,to_type,ta_rate,ta_fixed\nSiliguri,,,Naxalbari,25,ex,,\nSiliguri,Naxalbari,Jalpaiguri,Mainaguri,40.5,OUT,,350\n';
    expect(readRoutesCsv(csv)).toEqual({
      errors: [],
      rows: [
        { line: 2, fromHq: 'Siliguri', fromPlace: undefined, fromType: undefined, toHq: 'Siliguri', toPlace: 'Naxalbari', toType: 'EX_STATION', distanceKm: '25', taPerKmRateOverridePaise: null, taFixedPaise: null },
        { line: 3, fromHq: 'Siliguri', fromPlace: 'Naxalbari', fromType: undefined, toHq: 'Jalpaiguri', toPlace: 'Mainaguri', toType: 'OUT_STATION', distanceKm: '40.5', taPerKmRateOverridePaise: null, taFixedPaise: 35000 },
      ],
    });
  });

  it('lists every bad cell by line and needs the core columns', () => {
    const csv = 'from_hq,to_place,km,to_type,ta_rate,ta_fixed\n,X,0,far,7.5,100\n';
    expect(readRoutesCsv(csv).errors).toEqual([
      { line: 2, message: 'From HQ is required.' },
      { line: 2, message: 'km must be more than 0, with up to 2 decimals.' },
      { line: 2, message: 'Give either ta_rate or ta_fixed, not both.' },
      { line: 2, message: 'to_type must be HQ, EX or OUT.' },
    ]);
    expect(readRoutesCsv('zone,hq\nA,B\n').errors[0]?.line).toBe(1);
  });
});
