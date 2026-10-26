import type { PlanPerson, UserDirectoryPort } from '../domain/userDirectory.port.js';

/** Looks up the colleagues named on a plan's days once, and gives each day its own list in the order the day holds them. */
export async function makePlanPeopleNamer(users: UserDirectoryPort, days: Array<{ workWith: string[] }>): Promise<(workWith: string[]) => PlanPerson[]> {
  const ids = [...new Set(days.flatMap((d) => d.workWith))];
  const people = new Map((await users.namePeople(ids)).map((p) => [p.id, p]));
  return (workWith) => workWith.flatMap((id) => people.get(id) ?? []);
}

/** `day` with `workWithPeople` beside its `workWith` ids: who the day is spent with, named — the ids stay for anything that saves them back. */
export const withPeople = <T extends { workWith: string[] }>(day: T, peopleOf: (workWith: string[]) => PlanPerson[]): T & { workWithPeople: PlanPerson[] } => ({
  ...day,
  workWithPeople: peopleOf(day.workWith),
});
