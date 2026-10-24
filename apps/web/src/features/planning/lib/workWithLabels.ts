import { designationsApi, identityApi } from '@/lib/api/endpoints/identity';

/** "Name (Designation)" for each colleague id, looked up once before a CSV is built (a row cannot wait on a hook). Unknown ids are left out. */
export async function resolveWorkWithLabels(token: string, ids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const [people, designations] = await Promise.all([Promise.all(unique.map((id) => identityApi.user(token, id))), designationsApi.list(token)]);
  const designationOf = new Map(designations.map((d) => [d.id, d.name]));
  return new Map(
    people.map((p) => {
      const designation = designationOf.get(p.profile?.designationId ?? '');
      return [p.id, designation ? `${p.name} (${designation})` : p.name];
    }),
  );
}
