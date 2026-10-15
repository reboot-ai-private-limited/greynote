'use client';

import type { ReportingMemberDto, UserDetailDto } from '@greynote/contracts';
import { ChevronDown, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Avatar } from './Avatar';
import { useDesignations } from '../hooks/useMasterData';
import { useReportingLine } from '../hooks/useUsers';

type Member = ReportingMemberDto & { depth: number };

/** Who this person reports to (all the way up) and everyone who reports to them, any depth, as a tree that opens level by level. */
export function TeamTab({ user }: { user: UserDetailDto }) {
  const line = useReportingLine(user.id);
  const designations = useDesignations();
  const designationName = new Map((designations.data ?? []).map((d) => [d.id, d.name]));
  const label = (m: ReportingMemberDto) => (m.designationId ? (designationName.get(m.designationId) ?? '') : '');

  const childrenOf = useMemo(() => {
    const map = new Map<string, Member[]>();
    for (const m of line.data?.downline ?? []) {
      if (!m.managerId) continue;
      map.set(m.managerId, [...(map.get(m.managerId) ?? []), m]);
    }
    return map;
  }, [line.data]);

  if (line.isLoading) return <p className="text-sm text-text-muted">Loading…</p>;
  if (line.isError || !line.data) return <p className="text-sm text-danger-fg">The team could not be loaded.</p>;

  const upline = [...line.data.upline].reverse(); // top first
  const direct = childrenOf.get(user.id) ?? [];

  return (
    <>
      <Card title="Reports to" description="From the top of the reporting line down to this person. Change the manager in Profile → Work.">
        {upline.length === 0 ? (
          <p className="px-5 py-4 text-sm text-text-muted">No manager. {user.name} is at the top of the line.</p>
        ) : (
          <ol className="divide-y divide-border">
            {upline.map((m, i) => (
              <li key={m.id} className="py-2 pr-5" style={{ paddingLeft: `${20 + i * 20}px` }}>
                <PersonLink member={m} designation={label(m)} />
              </li>
            ))}
            <li className="bg-surface-hover py-2 pr-5 text-sm font-semibold" style={{ paddingLeft: `${20 + upline.length * 20}px` }}>
              {user.name} <span className="font-normal text-text-muted">(this employee)</span>
            </li>
          </ol>
        )}
      </Card>
      <Card
        title="Team"
        {...(line.data.downline.length > 0
          ? { description: `${direct.length} direct ${direct.length === 1 ? 'report' : 'reports'}, ${line.data.downline.length} in all.` }
          : {})}
      >
        {direct.length === 0 ? (
          <p className="px-5 py-4 text-sm text-text-muted">No one reports to {user.name}.</p>
        ) : (
          <ul className="divide-y divide-border">
            {direct.map((m) => (
              <TeamNode key={m.id} member={m} childrenOf={childrenOf} label={label} />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function TeamNode({
  member,
  childrenOf,
  label,
}: {
  member: Member;
  childrenOf: Map<string, Member[]>;
  label: (m: ReportingMemberDto) => string;
}) {
  const [open, setOpen] = useState(false);
  const kids = childrenOf.get(member.id) ?? [];
  return (
    <li>
      <div className="flex items-center gap-2 py-2 pr-5" style={{ paddingLeft: `${12 + (member.depth - 1) * 20}px` }}>
        {kids.length > 0 ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? `Hide ${member.name}'s team` : `Show ${member.name}'s team`}
            onClick={() => setOpen((v) => !v)}
            className="rounded p-0.5 text-text-subtle hover:bg-surface-hover focus-visible:shadow-focus focus-visible:outline-none"
          >
            {open ? <ChevronDown aria-hidden className="size-4" /> : <ChevronRight aria-hidden className="size-4" />}
          </button>
        ) : (
          <span className="size-5" />
        )}
        <PersonLink member={member} designation={label(member)} />
        {kids.length > 0 ? <span className="text-xs text-text-muted">{kids.length} {kids.length === 1 ? 'report' : 'reports'}</span> : null}
      </div>
      {open && kids.length > 0 ? (
        <ul className="divide-y divide-border border-t border-border">
          {kids.map((k) => (
            <TeamNode key={k.id} member={k} childrenOf={childrenOf} label={label} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function PersonLink({ member, designation }: { member: ReportingMemberDto; designation: string }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <Avatar name={member.name} url={member.photoUrl} />
      <Link href={`/employees/${member.id}`} className="truncate font-medium text-text hover:text-accent hover:underline">
        {member.name}
      </Link>
      <span className="shrink-0 text-xs text-text-muted">
        {member.employeeCode}
        {designation ? ` · ${designation}` : ''}
      </span>
      {member.status !== 'ACTIVE' ? <Badge tone="neutral">{member.status.toLowerCase()}</Badge> : null}
    </span>
  );
}
