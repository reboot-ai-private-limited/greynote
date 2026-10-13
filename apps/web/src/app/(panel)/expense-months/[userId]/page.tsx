import { redirect } from 'next/navigation';

export default async function ExpenseMonthReviewRedirect({ params, searchParams }: { params: Promise<{ userId: string }>; searchParams: Promise<{ month?: string }> }) {
  const { userId } = await params;
  const { month } = await searchParams;
  redirect(`/expenses/${userId}${month ? `?month=${encodeURIComponent(month)}` : ''}`);
}
