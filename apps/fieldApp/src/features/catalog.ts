import type { Href } from 'expo-router';
import type { SymbolViewProps } from 'expo-symbols';

import type { Accent } from '@/constants/theme';

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
  | 'add-doctor' | 'missed-calls' | 'expenses' | 'leave' | 'summary'
  | 'orders' | 'visuals' | 'targets' | 'secondary-sales' | 'gifts' | 'services'
  | 'inbox' | 'my-requests' | 'holidays' | 'financial-year';

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
  /** Short line under the title on the Home tile. */
  subtitle: string;
  /** Tile colour on Home. */
  accent: Accent;
  /** Shown as a wide, gradient call-to-action tile instead of a regular one. */
  cta?: boolean;
  /** The real screen, once built; until then the tile opens the placeholder. */
  route?: Href;
  /** One line shown on the placeholder screen. */
  about: string;
};

const icon = (ios: string, android: string): SymbolViewProps['name'] =>
  ({ ios, android, web: android }) as SymbolViewProps['name'];

export const FEATURES: Feature[] = [
  { key: 'daily-plan', title: 'Daily Plan', subtitle: 'Plan today’s visits', accent: 'blue', section: 'DCR', gate: 'unblocked', stage: 3, route: '/daily-plan', icon: icon('calendar', 'today'), about: 'Pick the day’s working type, who you work with and your routes, then submit for approval.' },
  { key: 'monthly-plan', title: 'Tour Plan', subtitle: 'Plan your month, day by day', accent: 'indigo', section: 'DCR', gate: 'unblocked', stage: 3, route: '/monthly-plan', icon: icon('calendar.badge.clock', 'calendar_month'), about: 'Plan next month day by day before the cutoff.' },
  { key: 'dr-call', title: 'Dr Call', subtitle: 'Log a doctor visit', accent: 'teal', section: 'DCR', gate: 'plan', stage: 4, route: '/dr-call', icon: icon('stethoscope', 'medical_services'), about: 'Log a visit to a doctor, with samples given. Your location is checked against the doctor’s.' },
  { key: 'dr-followup', title: 'Dr Followup', subtitle: 'Pending doctor followups', accent: 'sky', section: 'DCR', gate: 'plan', stage: 4, route: '/dr-followup', icon: icon('text.bubble', 'chat'), about: 'Add a follow-up note on a doctor.' },
  { key: 'chemist-call', title: 'Chemist Call', subtitle: 'Log a chemist visit', accent: 'green', section: 'DCR', gate: 'plan', stage: 4, route: '/chemist-call', icon: icon('cross.case', 'local_pharmacy'), about: 'Log a visit to a chemist. Your location is checked against the chemist’s.' },
  { key: 'chemist-followup', title: 'Chemist Followup', subtitle: 'Pending chemist followups', accent: 'lime', section: 'DCR', gate: 'plan', stage: 4, route: '/chemist-followup', icon: icon('text.bubble.fill', 'forum'), about: 'Add a follow-up note on a chemist.' },
  { key: 'add-doctor', title: 'Add Doctor', subtitle: 'Add a new doctor', accent: 'purple', section: 'DCR', gate: 'none', stage: 4, route: '/add-doctor', icon: icon('person.badge.plus', 'person_add'), about: 'Add a new doctor with their location; your manager and Admin approve it.' },
  { key: 'missed-calls', title: 'Missed Calls', subtitle: 'Planned but not visited', accent: 'red', section: 'DCR', gate: 'none', stage: 4, route: '/missed-calls', icon: icon('phone.arrow.down.left', 'phone_missed'), about: 'Your doctors’ monthly visit targets against the calls you made.' },
  { key: 'expenses', title: 'Expenses', subtitle: 'Add daily allowance & bills', accent: 'amber', section: 'DCR', gate: 'none', stage: 4, route: '/expenses', icon: icon('indianrupeesign.circle', 'payments'), about: 'Your month of TA, DA and other costs. Send it after the month ends; your manager approves it.' },
  { key: 'leave', title: 'Leave', subtitle: 'Apply or view leave', accent: 'pink', section: 'DCR', gate: 'none', stage: 4, route: '/leave', icon: icon('beach.umbrella', 'beach_access'), about: 'See your balances and request leave. Still available while your account is blocked.' },
  { key: 'summary', title: 'Summary & Submit', subtitle: 'Review today’s DCR and submit to your manager', accent: 'orange', cta: true, section: 'DCR', gate: 'unblocked', stage: 4, route: '/summary', icon: icon('checkmark.seal', 'task_alt'), about: 'Review the whole day and send it with Final Submission. Needs a connection.' },

  { key: 'orders', title: 'Orders', subtitle: 'Chemist and distributor orders', accent: 'orange', section: 'Marketing', gate: 'none', stage: 6, route: '/orders', icon: icon('cart', 'shopping_cart'), about: 'Take chemist and distributor orders by product.' },
  { key: 'visuals', title: 'Visuals', subtitle: 'E-detailing for doctors', accent: 'purple', section: 'Marketing', gate: 'none', stage: 6, route: '/visuals', icon: icon('photo.on.rectangle', 'slideshow'), about: 'Show e-detailing visuals to doctors.' },
  { key: 'targets', title: 'Targets', subtitle: 'Your monthly targets', accent: 'red', section: 'Marketing', gate: 'none', stage: 6, route: '/targets', icon: icon('target', 'track_changes'), about: 'Your monthly targets, and your team’s if you manage one.' },
  { key: 'secondary-sales', title: 'Secondary Sales', subtitle: 'Units sold each month', accent: 'green', section: 'Marketing', gate: 'none', stage: 6, route: '/secondary-sales', icon: icon('chart.line.uptrend.xyaxis', 'trending_up'), about: 'Enter the units you sold each month, per product. This is your achievement.' },
  { key: 'gifts', title: 'Gifts', subtitle: 'Gifts for your doctors', accent: 'pink', section: 'Marketing', gate: 'none', stage: 6, route: '/gifts', icon: icon('gift', 'redeem'), about: 'Gifts Admin allocated to your doctors — mark each done once given.' },
  { key: 'services', title: 'Services', subtitle: 'Request a doctor service', accent: 'indigo', section: 'Marketing', gate: 'none', stage: 6, route: '/services', icon: icon('briefcase', 'work'), about: 'Request a service for a doctor; it goes through approval.' },

  { key: 'inbox', title: 'Inbox', subtitle: 'Messages for you', accent: 'blue', section: 'Utility', gate: 'none', stage: 7, route: '/inbox', icon: icon('tray', 'inbox'), about: 'Messages your company sent you.' },
  { key: 'my-requests', title: 'My Requests', subtitle: 'Sent for approval', accent: 'teal', section: 'Utility', gate: 'none', stage: 7, route: '/my-requests', icon: icon('checklist', 'assignment_turned_in'), about: 'Everything you sent for approval, where it stands and why it was rejected.' },
  { key: 'holidays', title: 'Holiday List', subtitle: 'National, zone and HQ', accent: 'sky', section: 'Utility', gate: 'none', stage: 7, route: '/holidays', icon: icon('calendar.circle', 'event'), about: 'National, zone and HQ holidays.' },
  { key: 'financial-year', title: 'Financial Year', subtitle: 'Look back, read-only', accent: 'indigo', section: 'Utility', gate: 'none', stage: 7, route: '/financial-year', icon: icon('clock.arrow.circlepath', 'history'), about: 'Look back at a previous financial year (read-only).' },
];

export const SECTIONS: Section[] = ['DCR', 'Marketing', 'Utility'];

export const featureByKey = (key: string | undefined) => FEATURES.find((f) => f.key === key);
