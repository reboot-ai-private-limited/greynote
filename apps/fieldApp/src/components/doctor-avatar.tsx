import { UserAvatar } from './user-avatar';

/** A doctor's photo in a circle, or their initials when there is none (docs/mobile/doctors.md section 2). */
export function DoctorAvatar({ name, photoUrl, size = 40 }: { name: string; photoUrl?: string | null; size?: number }) {
  return <UserAvatar name={name} photoUrl={photoUrl ?? null} size={size} tone="plain" initials />;
}
