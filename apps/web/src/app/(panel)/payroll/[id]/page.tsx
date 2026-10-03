import { PayrollRunScreen } from '@/features/payroll/components/PayrollRunScreen';

export default async function PayrollRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PayrollRunScreen id={id} />;
}
