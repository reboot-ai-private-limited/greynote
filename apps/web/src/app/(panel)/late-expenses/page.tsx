import { redirect } from 'next/navigation';

/** Late exceptions are a tab of Expenses now; this address is kept so old links still work. */
export default function LateExpensesPage() {
  redirect('/expenses?tab=late');
}
