import mongoose, { Types } from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';
import { ProductModel } from '@/modules/field-master-data/infrastructure/product.schema.js';
import { DistributorModel } from '@/modules/field-master-data/infrastructure/distributor.schema.js';
import { UserModel } from '@/modules/identity/infrastructure/user.schema.js';
import { TargetModel } from '@/modules/marketing/infrastructure/marketing.schema.js';
import { SecondaryStockLineModel } from '@/modules/sales/infrastructure/secondaryStockLine.schema.js';
import { assertLocalDatabase, LOCAL_TEST_PASSWORD } from './localTestData.js';

/**
 * Secondary sales for the demo MRs, so the Secondary Sales sheet (the Excel) has something to show. LOCAL DATABASE ONLY (it refuses any other
 * `MONGO_URI`). Needs `seed:local-test` applied, and the local API running for the targets (they are set through the real Admin API).
 *
 *   DOTENV_CONFIG_PATH=.env.local pnpm --filter @greynote/api seed:secondary-demo            dry run
 *   DOTENV_CONFIG_PATH=.env.local pnpm --filter @greynote/api seed:secondary-demo -- --apply  write
 *
 * What it makes, for the financial year that holds today (April to March):
 *  - targets (in units) for each demo MR on eight products: one for the first half, a different one for the second, so a target spread over a run of months shows;
 *  - approved secondary rows for April to the month before this one, different per MR, product and month (some products are left out of some months);
 *  - a **draft** month for two MRs in this month, which must NOT count (only approved does);
 *  - the whole previous financial year approved for two MRs, so "% GR." has something to compare with.
 * The rows are written straight into the local database as approved: the real submit path needs a proof upload and Cloudinary is not set up locally.
 * Safe to run again: it first removes what an earlier run made for these MRs (their rows and their product targets in these two years).
 */
const API = process.env.TEAM_DEMO_API ?? 'http://127.0.0.1:3100/api';
const MRS = ['DEMOMRA1', 'DEMOMRA2', 'DEMOMRA3', 'DEMOMRB1', 'DEMOMRB2', 'DEMOMRR1', 'DEMOMRR2'];
const DRAFT_THIS_MONTH = ['DEMOMRA1', 'DEMOMRB1'];
const WITH_LAST_YEAR = ['DEMOMRA1', 'DEMOMRB1'];
const PRODUCTS = 8;

const pad = (n: number) => String(n).padStart(2, '0');
const monthsFrom = (year: number, startMonth: number): string[] => Array.from({ length: 12 }, (_, i) => { const m = startMonth - 1 + i; return `${year + Math.floor(m / 12)}-${pad((m % 12) + 1)}`; });
/** A repeatable number from a few small ones, so a second run writes the same figures. */
const wobble = (...parts: number[]) => { let h = 17; for (const p of parts) h = (h * 31 + p * 7919) % 1_000_003; return (h % 1000) / 1000; };

async function login(code: string): Promise<string> {
  const r = await fetch(`${API}/identity/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Client': 'mobile' }, body: JSON.stringify({ employeeCode: code, password: LOCAL_TEST_PASSWORD, deviceId: `sec-demo-${code}`, deviceName: 'seed', deviceModel: 'script', platform: 'ANDROID' }) });
  const j = (await r.json().catch(() => ({}))) as { data?: { accessToken?: string } };
  if (!j.data?.accessToken) throw new Error(`cannot log in as ${code} (${r.status}); is the local API running and seed:local-test applied?`);
  return j.data.accessToken;
}

async function main(): Promise<void> {
  assertLocalDatabase(env.MONGO_URI);
  const apply = process.argv.includes('--apply');
  await mongoose.connect(env.MONGO_URI);
  try {
    const now = new Date();
    const startMonth = 4;
    const year = now.getUTCMonth() + 1 >= startMonth ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    const thisMonth = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}`;
    const months = monthsFrom(year, startMonth);
    const before = monthsFrom(year - 1, startMonth);

    const users = await UserModel.find({ employeeCode: { $in: MRS } }, { _id: 1, employeeCode: 1 }).lean();
    const idOf = new Map(users.map((u) => [u.employeeCode, u._id as Types.ObjectId]));
    const missing = MRS.filter((c) => !idOf.has(c));
    if (missing.length) throw new Error(`the demo MRs are not there (${missing.join(', ')}); run seed:local-test -- --apply first`);
    const products = await ProductModel.find({ status: 'active', ptsPaise: { $gt: 0 } }, { _id: 1, name: 1, sku: 1, ptsPaise: 1 }).sort({ sku: 1 }).limit(PRODUCTS).lean();
    const dist = await DistributorModel.find({ name: /^TEST Distributor / }, { _id: 1, name: 1 }).lean();
    if (products.length < PRODUCTS) throw new Error(`need ${PRODUCTS} active products with a PTS, found ${products.length}`);
    if (dist.length === 0) throw new Error('no TEST distributors; run seed:local-test -- --apply first');

    logger.info({ financialYear: `${year}-${String((year + 1) % 100).padStart(2, '0')}`, products: products.map((p) => p.name), distributors: dist.map((d) => d.name) }, apply ? 'seeding' : 'dry run');
    const rows: Record<string, unknown>[] = [];
    const add = (mr: string, p: (typeof products)[number], mi: number, month: string, status: 'APPROVED' | 'DRAFT', scale: number) => {
      const iMr = MRS.indexOf(mr);
      const base = 40 + ((p.sku ? Number(String(p.sku).replace(/\D/g, '')) || 1 : 1) % 7) * 12;
      const issued = Math.max(0, Math.round(base * scale * (0.55 + wobble(iMr, products.indexOf(p), mi) * 0.9)));
      if (issued === 0) return;
      rows.push({ userId: idOf.get(mr)!, distributorId: dist[(iMr + products.indexOf(p)) % dist.length]!._id, productId: p._id, month, openingQty: 0, primaryQty: issued, issuedQty: issued, status, updatedAt: now });
    };
    for (const mr of MRS) {
      products.forEach((p, j) => {
        months.forEach((month, mi) => {
          if (month >= thisMonth) return;
          if ((MRS.indexOf(mr) + j + mi) % 5 === 0) return; // some products are not sold in some months
          add(mr, p, mi, month, 'APPROVED', 1);
        });
        if (DRAFT_THIS_MONTH.includes(mr) && j < 4) add(mr, p, months.indexOf(thisMonth), thisMonth, 'DRAFT', 1);
        if (WITH_LAST_YEAR.includes(mr) && j < 5) before.forEach((month, mi) => add(mr, p, mi + 40, month, 'APPROVED', 0.8));
      });
    }
    logger.info({ rows: rows.length, mrs: MRS.length }, 'secondary rows to write');
    if (!apply) {
      logger.info('dry run: nothing was written. Run again with -- --apply.');
      return;
    }

    const mrIds = [...idOf.values()];
    const span = { $gte: before[0]!, $lte: months[11]! };
    await SecondaryStockLineModel.deleteMany({ userId: { $in: mrIds }, month: span });
    await SecondaryStockLineModel.insertMany(rows);
    await TargetModel.deleteMany({ userId: { $in: mrIds }, productId: { $ne: null }, campaignId: null, month: { $gte: months[0]! }, toMonth: { $lte: months[11]! } });

    const token = await login('ADMIN01');
    let made = 0;
    const refused: string[] = [];
    for (const mr of MRS) {
      for (const [j, p] of products.entries()) {
        const base = 40 + ((Number(String(p.sku).replace(/\D/g, '')) || 1) % 7) * 12;
        for (const [from, to, units] of [[months[0]!, months[5]!, base * 6], [months[6]!, months[11]!, Math.round(base * 6.6)]] as const) {
          const r = await fetch(`${API}/marketing/targets`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'X-Client': 'web' }, body: JSON.stringify({ userId: String(idOf.get(mr)), productId: String(p._id), month: from, toMonth: to, targetQty: units + j }) });
          if (r.ok) made += 1;
          else refused.push(`${mr} ${p.name} ${from}..${to}: ${r.status} ${(await r.text()).slice(0, 120)}`);
        }
      }
    }
    logger.info({ secondaryRows: rows.length, targets: made, refused: refused.length }, 'done');
    for (const line of refused.slice(0, 10)) logger.warn(line);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  logger.error({ err }, 'seed-secondary-demo failed');
  process.exitCode = 1;
});
