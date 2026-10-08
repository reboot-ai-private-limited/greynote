import { TabPlaceholder } from '@/components/tab-placeholder';

// TODO: the Resources library (PRD §6.2 C).
export default function DocsScreen() {
  return (
    <TabPlaceholder
      title="Docs"
      summary="Company documents you can open any time."
      upcoming={['Price lists', 'Product literature', 'Training material', 'Company policies']}
    />
  );
}
