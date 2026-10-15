# ERD Index

Built module by module (see PRD for feature context). Each module is its own file so diagrams stay readable and reviewable independently.

| #   | Module                                                            | File                                                   | Status |
| :-- | :---------------------------------------------------------------- | :----------------------------------------------------- | :----- |
| 1   | Identity & Hierarchy (User, Role, Designation, Pay Band)          | [01-identity-hierarchy.md](./01-identity-hierarchy.md) | Done   |
| 2   | Territory Master (Zone, HQ, Route)                                | [02-territory-master.md](./02-territory-master.md)     | Done   |
| 3   | Field Master Data (Doctor, Chemist, Distributor, Product, Sample) | [03-field-master-data.md](./03-field-master-data.md)   | Done   |
| 4   | Field Activity: Calls, Followups & Expenses                       | [04-field-activity.md](./04-field-activity.md)         | Done   |
| 5   | Planning (Daily/Monthly Plan) + Rules/Config                      | [05-planning-and-rules.md](./05-planning-and-rules.md) | Done   |
| 6   | Sales & Orders (Order, Monthly Opening/Closing Stock)             | [06-sales-and-orders.md](./06-sales-and-orders.md)     | Done   |
| 7   | HR Ops (Leave, Holidays)                                          | [07-hr-ops.md](./07-hr-ops.md)                         | Done   |
| 8   | Marketing (Visuals)                                               | [08-marketing.md](./08-marketing.md)                   | Done   |
| 9   | Payroll & Compensation (PayrollRun)                               | [09-payroll.md](./09-payroll.md)                       | Done   |
| 10  | Inbox (InboxMessage, InboxReceipt)                                | [10-inbox.md](./10-inbox.md)                           | Done   |
| 11  | Documents (CompanyDocument)                                       | [11-documents.md](./11-documents.md)                   | Done   |
| 12  | Team alert marks (TeamAlertMark)                                  | [12-team-alert-marks.md](./12-team-alert-marks.md)     | Done   |
| 13  | Notifications (push token on sessions, ReminderMark)              | [13-notifications.md](./13-notifications.md)           | Done   |

Added after auditing coverage: Module 9 was added when reviewing HR/Accountant coverage against PRD §5.3 turned up that "generates final PAYROLL sheet" had no entity behind it. Module 1's `PayBand` also gained a `base_salary` field, and Module 4's `Expense` gained a `payment_status`/`paid_by`/`paid_at` settlement state, to support it.

Cross-cutting note: tunable values like submission cutoffs (daily plan @ 10 AM, monthly plan @ 28th) are **not** modeled as their own entity per rule. They live in a single generic `SystemConfig` table (`key`, `value`, `module`, `description`) introduced in Module 5, and referenced by name from whichever module needs a cutoff.
