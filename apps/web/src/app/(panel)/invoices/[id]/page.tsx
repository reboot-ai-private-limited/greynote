import { InvoiceScreen } from '@/features/invoices/components/InvoiceScreen';

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InvoiceScreen id={id} />;
}
