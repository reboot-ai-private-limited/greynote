import { formatMoney } from '@/lib/format';

/** The headline figures at the right of the Distributors toolbar; a dash while one is still loading. */
export function DistributorTotals({
  month,
  year,
  dues,
}: {
  month: number | undefined;
  year: number | undefined;
  dues: number | undefined;
}) {
  const items = [
    { label: 'Collected this month', paise: month },
    { label: 'Collected this year', paise: year },
    { label: 'Total dues', paise: dues },
  ];
  return (
    <dl className="flex items-center gap-6">
      {items.map((item) => (
        <div key={item.label} className="text-right">
          <dt className="text-xs text-text-subtle">{item.label}</dt>
          <dd className="font-medium tabular-nums">
            {item.paise === undefined ? <span className="text-text-subtle">—</span> : formatMoney(item.paise)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
