import { redirect } from 'next/navigation';

/** The payout is now part of Expenses (finalized months are paid there); this address is kept so old links still work. */
export default function ExpensePayoutsPage() {
  redirect('/expenses');
}
