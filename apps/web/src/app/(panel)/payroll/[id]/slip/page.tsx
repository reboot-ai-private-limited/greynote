import { PayslipScreen } from '@/features/payroll/components/PayslipScreen';

export default async function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PayslipScreen id={id} />;
}
