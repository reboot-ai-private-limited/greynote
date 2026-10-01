import { notFound } from 'next/navigation';
import { DesignScreen } from '@/features/design/components/DesignScreen';

/** The living style guide. Development only — it 404s in a production build. */
export default function DesignPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DesignScreen />;
}
