import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';
import { cloudinaryClient } from '@/shared/storage/cloudinary.js';
import { collectPublicIds, refusalReason, RESET_COLLECTIONS, RESET_FILTERED } from './resetFieldData.js';

/**
 * One-off clean start: wipes the approval queues and the records behind them, every doctor, chemist and route, and the
 * uploaded files (leave and expense attachments, doctor photos). Users, HQs and zones, products, pay bands and config stay.
 * System-sent inbox messages (createdBy null) go too; Admin announcements stay.
 *
 *   pnpm --filter @greynote/api reset:field-data                                     dry run — counts what would go
 *   pnpm --filter @greynote/api reset:field-data -- --apply --confirm-db=<dbname>    deletes
 *
 * mongodump first. Nothing here can be undone. Afterwards doctors and chemists cannot be added until routes exist again.
 */
const arg = (name: string): string | undefined => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(env.MONGO_URI);
  const db = mongoose.connection.db!;
  logger.info({ database: db.databaseName }, apply ? 'wiping' : 'dry run');

  if (apply) {
    const reason = refusalReason({ mongoUri: env.MONGO_URI, confirmDb: arg('confirm-db') });
    if (reason) throw new Error(reason);
  }

  // Collected before the rows go.
  const withFiles = [
    ...(await db.collection('leaves').find({ 'attachments.0': { $exists: true } }).project({ attachments: 1 }).toArray()),
    ...(await db.collection('expenses').find({ 'attachments.0': { $exists: true } }).project({ attachments: 1 }).toArray()),
    ...(await db.collection('doctors').find({ photo: { $ne: null } }).project({ photo: 1 }).toArray()),
  ];
  const publicIds = collectPublicIds(withFiles as never);

  const systemMessages = await db.collection('inboxmessages').find({ createdBy: null }).project({ _id: 1 }).toArray();
  const systemMessageIds = systemMessages.map((m) => m['_id']);

  const counts: Record<string, number> = {};
  for (const c of RESET_COLLECTIONS) counts[c] = await db.collection(c).countDocuments();
  for (const f of RESET_FILTERED) counts[`${f.collection} ${JSON.stringify(f.filter)}`] = await db.collection(f.collection).countDocuments(f.filter);
  counts['inboxmessages (system)'] = systemMessageIds.length;
  counts['inboxreceipts (system)'] = await db.collection('inboxreceipts').countDocuments({ messageId: { $in: systemMessageIds } });
  counts['distributors with routeIds'] = await db.collection('distributors').countDocuments({ 'routeIds.0': { $exists: true } });
  logger.info({ counts, cloudinaryFiles: publicIds.length }, apply ? 'deleting' : 'would delete');

  if (!apply) {
    logger.info('dry run — nothing was written. Run again with --apply --confirm-db=<dbname> to delete.');
    await mongoose.disconnect();
    return;
  }

  for (const c of RESET_COLLECTIONS) logger.info({ collection: c, deleted: (await db.collection(c).deleteMany({})).deletedCount }, 'cleared');
  for (const f of RESET_FILTERED) logger.info({ collection: f.collection, deleted: (await db.collection(f.collection).deleteMany(f.filter)).deletedCount }, 'cleared');
  await db.collection('inboxreceipts').deleteMany({ messageId: { $in: systemMessageIds } });
  await db.collection('inboxmessages').deleteMany({ _id: { $in: systemMessageIds } });
  await db.collection('distributors').updateMany({}, { $set: { routeIds: [] } });

  // Files last, and a failure here must not undo or hide the wipe that already happened.
  if (publicIds.length) {
    try {
      const cloud = cloudinaryClient();
      for (let i = 0; i < publicIds.length; i += 100) await cloud.api.delete_resources(publicIds.slice(i, i + 100));
      logger.info({ files: publicIds.length }, 'cloudinary files deleted');
    } catch (err) {
      logger.warn({ err, publicIds }, 'database wiped, but the Cloudinary files could not be deleted; remove them by hand');
    }
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'reset failed');
  process.exit(1);
});
