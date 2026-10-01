import { notFound } from 'next/navigation';
import { ShellPreview } from '@/features/design/components/ShellPreview';

/** Dev-only: the real SideNav beside sample content, to check the rail without signing in. */
export default function ShellPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <ShellPreview />;
}
