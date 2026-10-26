import { designationsApi, identityApi } from '@/lib/api/endpoints/identity';

/** Whose file it is. The code is the tiebreaker: two people with one name and designation must not overwrite each other. */
export interface ExportOwner {
  name?: string | null;
  designation?: string | null;
  employeeCode?: string | null;
}

/** Lower case, `a-z0-9` joined by single hyphens; accents fold to their letter and anything else (an apostrophe, Devanagari) drops. */
export const slug = (text: string | null | undefined): string =>
  (text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** `<name>-<designation>-<what>[-<period>]-<code>.csv`: `rahul-roy-mr-monthly-plan-2026-11-emp03.csv`. An unknown owner reads `unknown`. */
export function exportFilename(owner: ExportOwner, what: string, period?: string): string {
  const name = slug(owner.name);
  const code = slug(owner.employeeCode);
  const who = name ? [name, slug(owner.designation)] : [code || 'unknown'];
  return `${[...who, what, period ? slug(period) : '', name ? code : ''].filter(Boolean).join('-')}.csv`;
}

/** The owner of a file by user id, with the designation named (the profile holds only its id). Read once before the file is built. */
export async function resolveExportOwner(token: string, userId: string): Promise<ExportOwner> {
  const [user, designations] = await Promise.all([identityApi.user(token, userId), designationsApi.list(token)]);
  return { name: user.name, employeeCode: user.employeeCode, designation: designations.find((d) => d.id === user.profile?.designationId)?.name ?? null };
}
