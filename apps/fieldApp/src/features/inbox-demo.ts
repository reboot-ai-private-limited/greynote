/**
 * Demo messages for the Inbox (Utility). They are made up for preview: the server has no inbox yet, so nothing here is
 * sent by anyone and nothing is read from the API. `minutesAgo` is how long before opening the screen each one "arrived".
 */
export type InboxKind = 'Announcement' | 'Reminder' | 'Policy' | 'Update';

export type InboxMessage = {
  id: string;
  kind: InboxKind;
  title: string;
  from: string;
  body: string;
  minutesAgo: number;
};

export const DEMO_MESSAGES: InboxMessage[] = [
  {
    id: 'demo-1',
    kind: 'Reminder',
    title: 'Submit your Daily Plan before 10:00',
    from: 'Field Operations',
    body: 'Your Daily Plan for today must be submitted before 10:00 so your manager can approve it. Calls and expenses stay locked until the plan is approved.\n\nIf you miss the deadline, ask your manager for a late-submission exception.',
    minutesAgo: 35,
  },
  {
    id: 'demo-2',
    kind: 'Update',
    title: 'Secondary Sales is now in the app',
    from: 'Product Team',
    body: 'You can now enter the units you sold each month under Marketing → Secondary Sales. Your achievement against your product targets is measured from these numbers.\n\nTargets are set per product, so check the Targets screen to see where you stand.',
    minutesAgo: 190,
  },
  {
    id: 'demo-3',
    kind: 'Announcement',
    title: 'Puja vacation: 15 and 16 October',
    from: 'HR',
    body: 'The company will be closed on 15 and 16 October for the Puja vacation. These days are on your Holiday List. No Daily Plan or reports are needed for them.\n\nWishing you and your family a happy festival.',
    minutesAgo: 60 * 26,
  },
  {
    id: 'demo-4',
    kind: 'Policy',
    title: 'Monthly expenses: how to send them',
    from: 'Accounts',
    body: 'Expenses are now a monthly statement. Add your own costs with the reason for each, then send the month for approval from the 1st of the next month. TA and DA are worked out for you from your approved reports.\n\nA month is paid only after your manager or Admin approves it.',
    minutesAgo: 60 * 30,
  },
  {
    id: 'demo-5',
    kind: 'Reminder',
    title: 'Visit your doctors: calls are behind target',
    from: 'Field Operations',
    body: 'Some of your doctors are behind their monthly visit target. Open Missed Calls under DCR to see who still needs a visit this month.\n\nOnly calls on submitted daily reports are counted, so submit each day.',
    minutesAgo: 60 * 52,
  },
  {
    id: 'demo-6',
    kind: 'Update',
    title: 'New product visuals are available',
    from: 'Marketing',
    body: 'New e-detailing visuals for Cetirizine 10 and Pantoprazole 40 are in Marketing → Visuals. Choose a doctor, tick the visuals you want to show, and submit.\n\nEach doctor keeps their own list.',
    minutesAgo: 60 * 24 * 4,
  },
  {
    id: 'demo-7',
    kind: 'Announcement',
    title: 'Welcome to Greynote Field',
    from: 'Greynote',
    body: 'Welcome. Plan your day, log your calls and expenses, and send everything for approval from one app that also works offline.\n\nUse the Utility tab for your holidays, inbox and the financial-year view.',
    minutesAgo: 60 * 24 * 9,
  },
];
