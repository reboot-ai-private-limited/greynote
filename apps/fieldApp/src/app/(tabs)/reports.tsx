import { TabPlaceholder } from '@/components/tab-placeholder';

// TODO: the Reports tab (PRD §6.3).
export default function ReportsScreen() {
  return (
    <TabPlaceholder
      title="Reports"
      summary="Your past work and its approval status."
      upcoming={[
        'DCR Report — past daily call reports',
        'TP Report — Tour Plans and their status',
        'Gift & Sales Report — samples, gifts and sales',
      ]}
    />
  );
}
