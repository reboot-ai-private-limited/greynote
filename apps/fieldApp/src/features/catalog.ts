import type { Href } from 'expo-router';
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
  | 'orders' | 'monthly-stock' | 'visuals' | 'targets' | 'secondary-sales' | 'gifts' | 'services'
  | 'holidays' | 'forms' | 'financial-year';

export type Gate = 'plan' | 'unblocked' | 'none';
/** Home's categories. PRD §6.2 also lists Resources (the document library); that is the Docs tab, so Home has no tab for it. */
export type Section = 'DCR' | 'Marketing' | 'Utility';

export type Feature = {
  key: FeatureKey;
  title: string;
  section: Section;
  gate: Gate;
  stage: number;
  icon: SymbolViewProps['name'];
  /** The real screen, once built; until then the tile opens the placeholder. */
  route?: Href;
  /** One line shown on the placeholder screen. */
  about: string;
};

const icon = (ios: string, android: string): SymbolViewProps['name'] =>
  ({ ios, android, web: android }) as SymbolViewProps['name'];

export const FEATURES: Feature[] = [
  { key: 'daily-plan', title: 'Daily Plan', section: 'DCR', gate: 'unblocked', stage: 3, route: '/daily-plan', icon: icon('calendar', 'today'), about: 'Pick the day’s working type, who you work with and your routes, then submit for approval.' },
  { key: 'monthly-plan', title: 'Monthly Plan', section: 'DCR', gate: 'unblocked', stage: 3, route: '/monthly-plan', icon: icon('calendar.badge.clock', 'calendar_month'), about: 'Plan next month day by day before the cutoff.' },
  { key: 'dr-call', title: 'Dr Call', section: 'DCR', gate: 'plan', stage: 4, route: '/dr-call', icon: icon('stethoscope', 'medical_services'), about: 'Log a visit to a doctor, with samples given. Your location is checked against the doctor’s.' },
  { key: 'dr-followup', title: 'Dr Followup', section: 'DCR', gate: 'plan', stage: 4, route: '/dr-followup', icon: icon('text.bubble', 'chat'), about: 'Add a follow-up note on a doctor.' },
  { key: 'chemist-call', title: 'Chemist Call', section: 'DCR', gate: 'plan', stage: 4, route: '/chemist-call', icon: icon('cross.case', 'local_pharmacy'), about: 'Log a visit to a chemist. Your location is checked against the chemist’s.' },
  { key: 'chemist-followup', title: 'Chemist Followup', section: 'DCR', gate: 'plan', stage: 4, route: '/chemist-followup', icon: icon('text.bubble.fill', 'forum'), about: 'Add a follow-up note on a chemist.' },
  { key: 'add-doctor', title: 'Add Doctor', section: 'DCR', gate: 'none', stage: 4, route: '/add-doctor', icon: icon('person.badge.plus', 'person_add'), about: 'Add a new doctor with their location; your manager and Admin approve it.' },
  { key: 'expenses', title: 'Expenses', section: 'DCR', gate: 'none', stage: 4, route: '/expenses', icon: icon('indianrupeesign.circle', 'payments'), about: 'Your month of TA, DA and other costs. Send it after the month ends; your manager approves it.' },
  { key: 'leave', title: 'Leave', section: 'DCR', gate: 'none', stage: 4, route: '/leave', icon: icon('beach.umbrella', 'beach_access'), about: 'See your balances and request leave. Still available while your account is blocked.' },
  { key: 'summary', title: 'Summary & Submit', section: 'DCR', gate: 'unblocked', stage: 4, route: '/summary', icon: icon('checkmark.seal', 'task_alt'), about: 'Review the whole day and send it with Final Submission. Needs a connection.' },

  { key: 'orders', title: 'Orders', section: 'Marketing', gate: 'none', stage: 6, route: '/orders', icon: icon('cart', 'shopping_cart'), about: 'Take chemist and distributor orders by product.' },
  { key: 'monthly-stock', title: 'Monthly Stock', section: 'Marketing', gate: 'none', stage: 6, route: '/monthly-stock', icon: icon('shippingbox', 'inventory_2'), about: 'Record opening and closing stock for the month.' },
  { key: 'visuals', title: 'Visuals', section: 'Marketing', gate: 'none', stage: 6, route: '/visuals', icon: icon('photo.on.rectangle', 'slideshow'), about: 'Show e-detailing visuals to doctors.' },
  { key: 'targets', title: 'Targets', section: 'Marketing', gate: 'none', stage: 6, route: '/targets', icon: icon('target', 'track_changes'), about: 'Your monthly targets, and your team’s if you manage one.' },
  { key: 'secondary-sales', title: 'Secondary Sales', section: 'Marketing', gate: 'none', stage: 6, route: '/secondary-sales', icon: icon('chart.line.uptrend.xyaxis', 'trending_up'), about: 'Enter the units you sold each month, per product. This is your achievement.' },
  { key: 'gifts', title: 'Gifts', section: 'Marketing', gate: 'none', stage: 6, route: '/gifts', icon: icon('gift', 'redeem'), about: 'Gifts Admin allocated to your doctors — mark each done once given.' },
  { key: 'services', title: 'Services', section: 'Marketing', gate: 'none', stage: 6, route: '/services', icon: icon('briefcase', 'work'), about: 'Request a service for a doctor; it goes through approval.' },

  { key: 'holidays', title: 'Holiday List', section: 'Utility', gate: 'none', stage: 7, route: '/holidays', icon: icon('calendar.circle', 'event'), about: 'National, zone and HQ holidays.' },
  { key: 'forms', title: 'Forms', section: 'Utility', gate: 'none', stage: 7, icon: icon('doc.plaintext', 'assignment'), about: 'Standard company request forms.' },
  { key: 'financial-year', title: 'Financial Year', section: 'Utility', gate: 'none', stage: 7, route: '/financial-year', icon: icon('clock.arrow.circlepath', 'history'), about: 'Look back at a previous financial year (read-only).' },
];

export const SECTIONS: Section[] = ['DCR', 'Marketing', 'Utility'];

export const featureByKey = (key: string | undefined) => FEATURES.find((f) => f.key === key);
