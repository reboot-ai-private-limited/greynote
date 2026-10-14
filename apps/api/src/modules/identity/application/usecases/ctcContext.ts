import { DEFAULT_PTAX_SLABS, parseSlabs } from '@greynote/contracts';
import { readConfigOr, parsePositiveInt, type ConfigReader } from '@/shared/config/readConfig.js';
import type { CtcContext } from '../../domain/ctcBreakdown.js';

/** The seeded `ESI_WAGE_CEILING`, for a database that has not been re-seeded since the setting was added. */
const DEFAULT_ESI_CEILING_RUPEES = 21_000;

/** What a CTC breakdown reads from System settings: the ESI wage ceiling and the professional tax slabs. */
export interface CtcContextPort {
  read(): Promise<CtcContext>;
}

/**
 * Reads both settings. A key the database does not have yet (not re-seeded) reads as its seeded default; a stored value that is
 * present but broken is a fault naming the key, never a silent default.
 */
export class ConfigCtcContext implements CtcContextPort {
  constructor(private readonly config: ConfigReader) {}

  async read(): Promise<CtcContext> {
    const ceiling = await readConfigOr(this.config, 'ESI_WAGE_CEILING', parsePositiveInt(1_000_000), DEFAULT_ESI_CEILING_RUPEES);
    const slabs = await readConfigOr(
      this.config,
      'PTAX_SLABS',
      (value) => {
        const parsed = parseSlabs(value);
        if (!parsed.ok) throw new RangeError(parsed.error);
        return parsed.slabs;
      },
      (() => {
        const parsed = parseSlabs(DEFAULT_PTAX_SLABS);
        return parsed.ok ? parsed.slabs : [];
      })(),
    );
    return { esiCeilingPaise: ceiling * 100, ptaxSlabs: slabs };
  }
}
