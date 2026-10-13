import { redirect } from 'next/navigation';

/** The month table is Expenses now; kept for links made while it was called Expenses by month. */
export default function ExpenseMonthsPage() {
  redirect('/expenses');
}
