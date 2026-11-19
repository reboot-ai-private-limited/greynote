import type { UserDirectoryPort } from '../domain/userDirectory.port.js';

/**
 * The employees an "assigned to" filter on the web stands for (decision-log 2026-11-19): the person and, unless `directOnly`, everyone below them at any depth,
 * the same rule the phone's Team uses (a manager sees what their team holds). Nothing is copied onto the manager; this is worked out per request.
 */
export async function assigneeScope(users: UserDirectoryPort, userId: string, directOnly = false): Promise<string[]> {
  if (directOnly) return [userId];
  return [...new Set([userId, ...(await users.getDownline(userId)).map((u) => u.id)])];
}

/** Ids of the employees whose name or code matches a search term, each with their team (unless `directOnly`). */
export async function employeesMatching(users: UserDirectoryPort, term: string, directOnly = false): Promise<string[]> {
  const found = await users.findUserIdsByName(term);
  if (directOnly) return found;
  const teams = await Promise.all(found.map((id) => assigneeScope(users, id)));
  return [...new Set([...found, ...teams.flat()])];
}
