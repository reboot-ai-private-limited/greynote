import type { SymbolViewProps } from 'expo-symbols';

/**
 * Every Home tile (PRD §6.2) in one list, so Home, the gate and the placeholder screen agree.
 *
 * `gate`:
 *   'plan'     — needs today's Tour Plan approved AND the account unblocked (HLD 10 §1): the
 *                calls, followups and expenses.
 *   'unblocked'— needs only the account unblocked (HLD 10 §2): submitting plans and the day.
 *   'none'     — always available, including while blocked (leave, reports, reference).
 * `stage` is the build stage in docs/mobile-app-plan.md that replaces the placeholder.
 */
export type FeatureKey =
  | 'daily-plan' | 'monthly-plan' | 'dr-call' | 'dr-followup' | 'chemist-call' | 'chemist-followup'
  | 'add-doctor' | 'expenses' | 'leave' | 'summary'
  | 'orders' | 'monthly-stock' | 'visuals' | 'campaigns' | 'targets' | 'gifts' | 'services'
  | 'documents'
  | 'holidays' | 'forms' | 'financial-year';

export type Gate = 'plan' | 'unblocked' | 'none';
export type Section = 'DCR' | 'Marketing' | 'Resources' | 'Utility';

export type Feature = {
  key: FeatureKey;
  title: string;
  section: Section;
  gate: Gate;
  stage: number;
  icon: SymbolViewProps['name'];
  /** One line shown on the placeholder screen. */
  about: string;
};

const icon = (ios: string, android: string): SymbolViewProps['name'] =>
  ({ ios, android, web: android }) as SymbolViewProps['name'];

export const FEATURES: Feature[] = [
  { key: 'daily-plan', title: 'Daily Plan', section: 'DCR', gate: 'unblocked', stage: 3, icon: icon('calendar', 'today'), about: 'Pick the day’s working type, who you work with and your routes, then submit for approval.' },
  { key: 'monthly-plan', title: 'Monthly Plan', section: 'DCR', gate: 'unblocked', stage: 3, icon: icon('calendar.badge.clock', 'calendar_month'), about: 'Plan next month day by day before the cutoff.' },
  { key: 'dr-call', title: 'Dr Call', section: 'DCR', gate: 'plan', stage: 4, icon: icon('stethoscope', 'medical_services'), about: 'Log a visit to a doctor, with samples given. Your location is checked against the doctor’s.' },
  { key: 'dr-followup', title: 'Dr Followup', section: 'DCR', gate: 'plan', stage: 4, icon: icon('text.bubble', 'chat'), about: 'Add a follow-up note on a doctor.' },
  { key: 'chemist-call', title: 'Chemist Call', section: 'DCR', gate: 'plan', stage: 4, icon: icon('cross.case', 'local_pharmacy'), about: 'Log a visit to a chemist. Your location is checked against the chemist’s.' },
  { key: 'chemist-followup', title: 'Chemist Followup', section: 'DCR', gate: 'plan', stage: 4, icon: icon('text.bubble.fill', 'forum'), about: 'Add a follow-up note on a chemist.' },
  { key: 'add-doctor', title: 'Add Doctor', section: 'DCR', gate: 'none', stage: 4, icon: icon('person.badge.plus', 'person_add'), about: 'Add a new doctor with their location; your manager and Admin approve it.' },
  { key: 'expenses', title: 'Expenses', section: 'DCR', gate: 'plan', stage: 4, icon: icon('indianrupeesign.circle', 'payments'), about: 'Log travel, meals and other costs. TA and DA are worked out by the server.' },
  { key: 'leave', title: 'Leave', section: 'DCR', gate: 'none', stage: 4, icon: icon('beach.umbrella', 'beach_access'), about: 'See your balances and request leave. Still available while your account is blocked.' },
  { key: 'summary', title: 'Summary & Submit', section: 'DCR', gate: 'unblocked', stage: 4, icon: icon('checkmark.seal', 'task_alt'), about: 'Review the whole day and send it with Final Submission. Needs a connection.' },

  { key: 'orders', title: 'Orders', section: 'Marketing', gate: 'none', stage: 6, icon: icon('cart', 'shopping_cart'), about: 'Take chemist and distributor orders by product.' },
  { key: 'monthly-stock', title: 'Monthly Stock', section: 'Marketing', gate: 'none', stage: 6, icon: icon('shippingbox', 'inventory_2'), about: 'Record opening and closing stock for the month.' },
  { key: 'visuals', title: 'Visuals', section: 'Marketing', gate: 'none', stage: 6, icon: icon('photo.on.rectangle', 'slideshow'), about: 'Show e-detailing visuals to doctors.' },
  { key: 'campaigns', title: 'Campaigns', section: 'Marketing', gate: 'none', stage: 6, icon: icon('megaphone', 'campaign'), about: 'Company-wide campaigns running now.' },
  { key: 'targets', title: 'Targets', section: 'Marketing', gate: 'none', stage: 6, icon: icon('target', 'track_changes'), about: 'Your monthly targets, and your team’s if you manage one.' },
  { key: 'gifts', title: 'Gifts', section: 'Marketing', gate: 'none', stage: 6, icon: icon('gift', 'redeem'), about: 'Gifts Admin allocated to your doctors — mark each done once given.' },
  { key: 'services', title: 'Services', section: 'Marketing', gate: 'none', stage: 6, icon: icon('briefcase', 'work'), about: 'Request a service for a doctor; it goes through approval.' },

  { key: 'documents', title: 'Documents', section: 'Resources', gate: 'none', stage: 7, icon: icon('doc.text', 'description'), about: 'Price lists, literature and training material.' },

  { key: 'holidays', title: 'Holiday List', section: 'Utility', gate: 'none', stage: 7, icon: icon('calendar.circle', 'event'), about: 'National, zone and HQ holidays.' },
  { key: 'forms', title: 'Forms', section: 'Utility', gate: 'none', stage: 7, icon: icon('doc.plaintext', 'assignment'), about: 'Standard company request forms.' },
  { key: 'financial-year', title: 'Financial Year', section: 'Utility', gate: 'none', stage: 7, icon: icon('clock.arrow.circlepath', 'history'), about: 'Look back at a previous financial year (read-only).' },
];

export const SECTIONS: Section[] = ['DCR', 'Marketing', 'Resources', 'Utility'];

export const featureByKey = (key: string | undefined) => FEATURES.find((f) => f.key === key);
