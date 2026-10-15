import type { ReportingMemberDto } from '@greynote/contracts';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from './Avatar';

/** A person in a tree: photo, name linking to their profile, code and designation, and a badge when they are not active. */
export function PersonLink({
  member,
  designation,
}: {
  member: ReportingMemberDto;
  designation: string;
}) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <Avatar name={member.name} url={member.photoUrl} />
      <Link
        href={`/employees/${member.id}`}
        className="truncate font-medium text-text hover:text-accent hover:underline"
      >
        {member.name}
      </Link>
      <span className="shrink-0 text-xs text-text-muted">
        {member.employeeCode}
        {designation ? ` · ${designation}` : ''}
      </span>
      {member.status !== 'active' ? (
        <Badge tone="neutral">{member.status.toLowerCase()}</Badge>
      ) : null}
    </span>
  );
}
