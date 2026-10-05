# Product Requirements Document (PRD): Pharma SFA Platform

**Date:** 2026-09-19

## 1. Executive Summary

The Sales Force HR Software is a lightweight, practical Sales Force Automation (SFA) platform tailored for pharmaceutical field operations. It strips away heavy ERP complexity, focusing strictly on daily call reporting (DCR), territory routing, expense management (TA/DA), and hierarchical approvals. The system is split into an **Offline-First Mobile App** for field execution and a **Web Portal** strictly for Admin, HR, and Accounting operations.

---

## 2. Platform Architecture & Constraints

- **Offline-First Strategy:** The mobile app must allow full read/write capabilities without an internet connection. Data (doctor lists, routes, visuals) is cached locally. Submissions (DCR, expenses, orders) are queued locally and synced to the server only when the user explicitly hits "Submit" with an active internet connection.
- **Backend Architecture:** Given the targeted scope and user base, the backend will be structured as a **Modular Monolith** rather than a microservices architecture, ensuring simpler deployment and maintenance while keeping domain boundaries (HR, Sales, Routing) clean.
- **Device & Session Limits:** Field-force (MR/Manager) mobile logins are capped at a configurable maximum of concurrent active devices (default **2**). Logging in beyond the limit is **blocked** with an explicit prompt to log out from an existing device first — there is no automatic/silent eviction of an older session. Web Portal roles (Admin/HR/Accountant) have no device limit.
- **Configurable Business Rules:** Cutoffs and limits that govern day-to-day operation (submission deadlines, device limits, location-check tolerance) are Admin-editable values, not hardcoded — see Section 8.

---

## 3. Glossary & Terminology

- **CALL:** A logged visit to a doctor or chemist.
- **TA (Travel Allowance):** Compensation for field travel, calculated by Route Distance (via API) × Per-Km Rate (based on Pay Band).
- **DA (Daily Allowance):** Fixed daily compensation for food/incidentals, dictated by the employee's Pay Band.
- **PAYROLL:** The final processed salary sheet, aggregating base pay, approved TA/DA, and leave deductions.
- **PRIMARY Sales:** Sales directly to stockists, distributors, or chemists.
- **SECONDARY Sales:** Stock remaining at the retail/distributor level at month-end.
- **TP (Tour Plan):** Forward-looking schedules (Daily or Monthly) submitted by field sales for manager approval.

---

## 4. User Personas & Access Distribution

### Web Portal (Back-Office)

_Sales managers are explicitly excluded from web-portal workflows to keep back-office operations restricted to administrative roles._

- **Admin (Superuser):** Has unrestricted access to all HR and Accounting modules and can perform every action that the HR or Accountant roles can perform (employee lifecycle, leave approvals, expense auditing, payroll generation), in addition to managing master data (routes, visuals, territories). Admin is also the final approval/visibility point for all field submissions (see Section 7).
- **HR:** Focuses on personnel, onboarding, promotions, leave management, and assigning compensation parameters.
- **Accountant:** A lightweight role focused purely on financial processing—finalizing the payroll sheet, disbursing TA/DA, and auditing approved expenses.

### Mobile App (Field Force)

- **Field Sales (MR - Medical Representative):** Executes daily calls, submits expenses, records orders.
- **Managers (ASM → RSM → ZSM → NSM):** Can perform all MR actions (submit their own TP, DCR, and expenses), plus utilize a conditional "Team" tab. On this tab, a manager can **approve** TP, daily plans, and expenses only for their direct reports (their Nearest Higher Manager relationship); for downline further removed than their direct reports, the tab shows **read-only** visibility (see Section 7.1).

---

## 5. Web Portal Features (Admin, HR, Accountant)

### 5.1 Route & Territory Master (Admin)

Territories are built on a strict spatial hierarchy: **Zone → Headquarter (HQ) → Route**.

- **Hierarchy Mapping:** E.g., West Bengal Zone → SLG-1 HQ → Naxalbari Route. An HQ has a base place (e.g., Siliguri); several HQs can share one.
- **Route Details:** A route runs from its HQ's base place to one destination place (e.g., "From Siliguri to Naxalbari") and has a type (HQ, Ex Station or Out Station) that sets the DA rate.
- **TA Automation:** When creating a route, an external API calculates the road distance from the HQ's base place to the destination. This distance is saved to automate TA calculations later. Admin can override it by hand.
- **Assignments:** Admin can assign MRs to specific routes and attach Doctors/Chemists to those routes. A route may have more than one MR assigned (shared coverage), and one MR can cover more than one route.
- **Direct Doctor Assignment:** Independently of route coverage, Admin can also assign one or more specific MRs directly to a Doctor. This direct assignment — not general route coverage — is what determines which MR(s) can see and act on that doctor's Sample/Gift allocations and auto-select for Admin-created Doctor Services (see Section 6.2).
- **Location Verification:** Doctor and Chemist master records carry a registered location (captured once when added). When an MR logs a Dr Call or Chemist Call, the app captures the MR's GPS position at that moment and validates it against the registered location within an Admin-configurable radius (see Section 8), flagging calls logged from outside that radius.

### 5.2 Employee Classification & Compensation (HR)

Employees are classified using a dual-matrix system to decouple job role from salary grade:

1.  **Designation (Role):** L1, L2, L3 (e.g., MR, ASM, RSM). Determines app permissions and reporting hierarchy.
2.  **Pay Band (Grade, shown as "Pay grade"):** G1, G2, … any name. Determines the financial rates — the **CTC range** an employee on it may be paid (each employee's own CTC sits inside it), the DA amounts, and the TA per-km rate per grade.
    - _Logic:_ Two employees with the same L1 designation can be on different Pay Bands (G1 vs G2), yielding different base salary, DA amounts, and TA per-km rates.
    - _Scope:_ Designation and Pay Band — and therefore Payroll (below) — apply to field-force employees only. Admin/HR/Accountant compensation is handled by a separate, external company payroll system outside this platform.

### 5.3 HR vs. Accountant Responsibilities

_Admin has superuser rights and can perform every HR and Accountant action listed below, in addition to master data management._

| Module                 | HR Role                                                                  | Accountant Role                                                                                                                                                                                                                                                                               |
| :--------------------- | :----------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Employee Lifecycle** | Add/Promote employees, assign Designation & Pay Band, manage hierarchy.  | View-only access to employee pay grades.                                                                                                                                                                                                                                                      |
| **Leave & Holidays**   | Manage leave balances, approve/reject leaves, maintain Holiday Calendar. | Syncs approved unpaid leaves for deduction.                                                                                                                                                                                                                                                   |
| **Expense Processing** | None.                                                                    | Audits manager-approved TA/DA, marks each as **paid** — a settlement step distinct from and after the manager's approval.                                                                                                                                                                     |
| **Payroll Generation** | None.                                                                    | Generates a final **PAYROLL sheet per field employee per month** (Base Salary + that month's _paid_ TA/DA − unpaid-leave deduction). Once generated, a sheet is a locked record (Draft → Finalized) — later edits to expenses or leave don't retroactively change an already-finalized month. |

**Leave allocation is grade-wise, not per-employee by default.** HR maintains a **Leave Master**: a default annual allocation per (Pay Band × Leave Type) combination (e.g., G1 gets 12 Casual days, G2 gets 15). Each employee's live leave balance is seeded from their Pay Band's default but can be individually overridden by HR (e.g., a one-off top-up). Every Leave Type is flagged **Paid** or **Unpaid** — Unpaid leave is exactly what feeds the Accountant's payroll deduction sync above. Leave _approval_ is the one workflow in this system that bypasses the Nearest-Manager chain (Section 7) — requests go directly to HR, per HR's ownership of leave management.

---

## 6. Mobile App Features (MR & Managers)

### 6.1 Core Navigation

- **Bottom Navigation:** Home, Docs, Reports, Team (Conditional: Only visible to ASM/RSM/ZSM/NSM for downline approvals).

### 6.2 Home Tab Modules

The Home tab acts as the primary dashboard, divided into 4 quadrants:

#### A. DCR (Daily Call Report)

The core operational flow for the field force. All menu items open dedicated pages:

- **Daily Plan (Tour Plan):** Select date (Quick tabs: Today, Tomorrow, Calendar) → Select Working Type (`Field Work`, `Meeting`, `Conference`, `Strike`) → Select "Work With" (array for joint work) → Select Routes (e.g., Bagdogra via Noukaghat) → Add Remarks.
- **Dr Call:** View list / Add new. Select Doctor → Select Working Type (`Field Work`, `Meeting`, `Conference`, `Strike`) → Work With → Remarks → Doctor Sample Provided (Yes/No, Name, Qty array) → Submit. The app captures the MR's GPS location at submission for the location-verification check described in Section 5.1.
- **Dr Followup:** Select Doctor → Add Remarks.
- **Chemist Call & Followup:** Similar flow to Doctor calls (including Working Type and location capture), tailored for primary/secondary order taking.
- **Gated on today's Tour Plan:** Dr Call, Dr Followup, Chemist Call, Chemist Followup, and Expenses can't be logged until today's Daily Plan (Tour Plan) has been Manager-Approved — see Section 7.5. A Daily Plan can still be _saved_ offline for UX; both its Submit and the DCR's Final Submission below require an active connection.
- **Doctor Samples:** Samples are not something the MR logs freely — Admin allocates a specific quantity of a product to a specific Doctor from the Web Portal. Only the MR(s) directly assigned to that doctor (Section 5.1) can see the remaining allocation and draw against it via the Dr Call's "Doctor Sample Provided" field.
- **Add Doctor:** Capture Category, Name, Address, Email, Specialty, and Qualification (class).
- **Expenses:** Log daily transit, meals, or miscellaneous costs.
- **Leave Management:** Request leave or view balances.
- **Summary & Final Submission:** The final daily step. Aggregates all Dr Calls, Chemist Calls, Followups, added Doctors, and Expenses into a single view. Submitting this syncs the offline payload to the server, and — like Tour Plan Submit — requires an active connection at the moment of submission.

#### B. Marketing

- **Sales & Orders:** Capture Stockist/Distributor Orders and Chemist Orders as a standalone action (not tied to a specific Chemist Call), itemized by product. Orders move through a Placed → Done/Cancelled lifecycle. Distributor and Chemist Monthly Opening/Closing stock counts are also captured here; Secondary Sales figures (Section 3 glossary) are derived from these counts rather than logged directly. None of this requires manager approval.
- **Visuals & Campaigns:** Show e-detailing visuals (uploaded by Admin, optionally tied to a specific product), run company-wide campaigns, and track Targets. A Target is set per MR per month (optionally narrowed to a specific product and/or campaign); a manager's effective target is automatically the sum of their entire downline's targets, plus any target Admin sets directly on that manager.
- **Gifts & Services:**
  - **Gifts:** Admin allocates a gift (a product name plus its value) to a specific Doctor from the Web Portal — same allocation pattern as Samples. The MR(s) assigned to that doctor see it and mark it **Done** once delivered. No manager approval needed.
  - **Services:** An MR can request a Doctor Service (type: `Tour Package`, `Gift`, `Online Promotion`, or `Others`, plus an amount) for one of their doctors — this goes through the same Nearest-Manager-then-Admin approval as DCR (Section 7). Admin can alternatively create a Service directly for a doctor: the covering MR is auto-selected from that doctor's direct assignment (Section 5.1) and the request is **auto-approved**, skipping manager review entirely.

#### C. Resources

Document library for price lists, product literatures, and training materials.

#### D. Utility

- **Holiday List:** View upcoming holidays scoped to National, Zone, or the employee's assigned HQ — a single holiday can apply to multiple Zones or HQs at once, or to everyone (National). The weekly off day (e.g. Sunday) is a configurable rule (Section 8), not an individually listed holiday.
- **Forms:** Quick access to standard company request forms.
- **Financial Year Toggle:** A "time machine" allowing users to switch the app's context to a previous financial year to view old reports or pending items.

### 6.3 Reports Tab

- **DCR Report:** Historical view of past daily call reports.
- **TP Report:** Status of submitted Tour Plans (Pending/Approved).
- **Gift & Sales Reports:** Analytics on samples distributed and primary/secondary sales logged.

---

## 7. Approval Workflows

### 7.1 General Rule: Two-Stage Approval + Read-Only Escalation

Every employee — including managers themselves (ASM, RSM, ZSM, NSM) — submits their own plans, calls, and expenses. Regardless of designation, a submission follows a fixed two-stage path:

1.  **Stage 1 (Approval):** The submission is routed to the employee's **Nearest Higher Manager** (immediate reporting manager only) for approval/rejection. E.g., an MR's submission goes to their ASM; an ASM's own submission goes to their RSM; an RSM's own submission goes to their ZSM, and so on.
2.  **Stage 2 (Admin):** Once the Nearest Higher Manager approves, the submission is forwarded **directly to Admin** on the web portal. It does **not** need further approval from any intermediate management level (e.g., an MR's plan approved by the ASM skips RSM/ZSM/NSM approval and goes straight to Admin).
3.  **Read-Only Visibility:** Any manager who sits between the Nearest Higher Manager and Admin in the reporting hierarchy (e.g., RSM, ZSM, NSM relative to an MR's submission) can **view** the submission and its approval status at any time, but cannot approve, reject, or edit it. This applies on the mobile app's "Team" tab (view-only for non-approving levels) as well as any web-portal visibility Admin grants.
4.  **Top-of-Chain Exception:** The employee at the very top of the field hierarchy (e.g., an NSM with no manager above them) still submits their own plans/DCR/expenses like everyone else, but has no Nearest Higher Manager to approve them. In this one case, the submission routes directly to Admin, who is the sole approver — there is no separate Stage 2 for it.

### 7.2 Tour Plan (TP) Approval

1.  Employee (MR or Manager) submits a Daily/Monthly Tour Plan via the mobile app.
2.  Nearest Higher Manager approves/rejects via the "Team" tab.
3.  On approval, the TP is forwarded directly to Admin for final record-keeping.
4.  All other managers above the Nearest Higher Manager in that reporting chain see the TP and its status as read-only.

### 7.3 DCR & Expenses Approval

1.  Employee hits "Final Submission" at day's end.
2.  Nearest Higher Manager reviews calls and auto-calculated TA/DA (based on mapped Route distance × Pay Band rate) and approves via the mobile app.
3.  Approved DCR & Expenses are forwarded directly to Admin on the web portal, bypassing intermediate hierarchy levels for approval purposes.
4.  Managers above the Nearest Higher Manager retain read-only visibility of the submission and its approval status but cannot act on it.

### 7.4 Financial Settlement

Once Admin has the approved expense record, it becomes available in the Accountant's web portal for final payout processing and inclusion in the PAYROLL sheet. As superuser, Admin can also perform this financial settlement step directly.

### 7.5 Compliance Blocking

If a field employee goes without submitting DCR for more than `DCR_MISS_GRACE_DAYS` (Section 8) and has no Manager-Approved Leave covering the missed day(s), the system automatically blocks them from further Daily/Monthly Plan submission, DCR Final Submission, and logging any new Dr Call, Dr Followup, Chemist Call, Chemist Followup, or Expense. They can still request Leave (e.g. to retroactively cover the gap) and view historical reports. Unlike every other approval/rejection in this section, this block can **only be lifted by Admin** — not the Nearest Manager — since it's a compliance action rather than a routine approval.

---

## 8. Configurable Business Rules

A number of operational thresholds are Admin-editable at runtime rather than hardcoded, so they can be tuned without a release. These include, but aren't limited to:

| Rule                                                  | Default                   | Notes                                                                                                                   |
| :---------------------------------------------------- | :------------------------ | :---------------------------------------------------------------------------------------------------------------------- |
| Daily Plan submission cutoff                          | 10:00 AM                  | Time by which the day's Daily Plan must be submitted.                                                                   |
| Monthly Plan submission cutoff                        | 28th (of the prior month) | Deadline for submitting next month's day-by-day Tour Plan.                                                              |
| Max concurrent active devices (Field role)            | 2                         | See Section 2 — login is blocked, not auto-evicted, beyond this.                                                        |
| DCR-miss grace period before compliance block         | 1 day                     | See Section 7.5 — days without a submitted DCR and without covering approved Leave, before the account is auto-blocked. |
| Location-verification radius (Dr Call / Chemist Call) | TBD (e.g. 200m)           | Allowed GPS deviation from a Doctor/Chemist's registered location before a call is flagged.                             |
| Weekly off day                                        | Sunday                    | Treated as a non-working day platform-wide without being listed as an individual Holiday.                               |
