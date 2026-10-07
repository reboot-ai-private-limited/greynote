# LLD Index

Low-level design, one file per ERD module: the module's public contract, write-path rules, HTTP
surface, edge cases, and what it deliberately defers. Built **on top of** the ERD (schema) and
HLD (cross-cutting mechanism) docs, not a repeat of them — an LLD doc references
`../erd/0N-*.md` for the full field list and `../hld/0N-*.md` for an algorithm or shared
mechanism instead of re-describing it.

## What lives where

| | |
|---|---|
| [`../prd.md`](../prd.md) | What we're building, for whom, what's out of scope. Start here. |
| [`../erd/`](../erd/README.md) | The 9-module entity model — fields, relationships |
| [`../hld/`](../hld/README.md) | Cross-cutting mechanisms — sync, auth, approvals, TA/DA, payroll, … |
| [`../roadmap.md`](../roadmap.md) | **Build order** — which module after which, and why |
| this directory | **Module design** — contracts, invariants, HTTP surface, edge cases |
| [`../engineering/`](../engineering/README.md) | How the code is structured, and why |

## Read in this order

Same order as [`../roadmap.md`](../roadmap.md) builds in — each doc names the modules and shared
mechanisms it depends on, so reading in build order means never forward-referencing something
undefined yet.

| # | Module | File | ERD | Depends on |
|---|---|---|---|---|
| 1 | Identity | [`identity.md`](identity.md) | [`01-identity-hierarchy`](../erd/01-identity-hierarchy.md) | — |
| 2 | Territory | [`territory.md`](territory.md) | [`02-territory-master`](../erd/02-territory-master.md) | Identity |
| 2b | Approval | [`approval.md`](approval.md) | — (HLD [`05`](../hld/05-approval-workflow-engine.md)) | Identity, Config |
| 2c | Sync & Geofencing | [`sync.md`](sync.md) | — (HLD [`01`](../hld/01-sync-and-geofencing.md)) | Identity |
| 3 | Field Master Data | [`field-master-data.md`](field-master-data.md) | [`03-field-master-data`](../erd/03-field-master-data.md) | Identity, Territory |
| 4 | Planning | [`planning.md`](planning.md) | [`05-planning-and-rules`](../erd/05-planning-and-rules.md) | Identity, Territory, Approval |
| 5 | HR | [`hr.md`](hr.md) | [`07-hr-ops`](../erd/07-hr-ops.md) | Identity, Territory |
| 6 | Field Activity | [`field-activity.md`](field-activity.md) | [`04-field-activity`](../erd/04-field-activity.md) | Identity, Territory, Field Master Data, Approval, Sync & Geofencing |
| 7 | Sales & Orders | [`sales-and-orders.md`](sales-and-orders.md) | [`06-sales-and-orders`](../erd/06-sales-and-orders.md) | Field Master Data |
| 8 | Marketing | [`marketing.md`](marketing.md) | [`08-marketing`](../erd/08-marketing.md) | Identity, Field Master Data |
| 9 | Payroll | [`payroll.md`](payroll.md) | [`09-payroll`](../erd/09-payroll.md) | Identity, HR, Attendance |
| 9b | Attendance | [`attendance.md`](attendance.md) | — (a read model, owns no data) | Identity, HR, Planning, Field Activity |

`Config` (Tier 0, `SystemConfig`) and `health` have no LLD doc of their own — they're small
enough that `hld/03-system-architecture.md` and the `health` module's own code are the complete
design.

## Conventions used throughout

- **Money** is a whole number of **paise** (integer), never a float or a decimal; the ERD's
  `decimal` money fields are stored that way (decided 2026-09-29). See
  [`../engineering/coding-standards.md#money`](../engineering/coding-standards.md#money).
- **Timestamps** are stored UTC, rendered in the user's local time (India-only deployment
  currently implies `Asia/Kolkata`, but nothing in the PRD hard-codes a single timezone).
- **IDs**: whatever `apps/api/src/shared/ids.ts` generates — check that file rather than assume.
- **Roles**: `ADMIN`, `HR`, `ACCOUNTANT` (Web Portal); `MR`/manager designations `ASM → RSM → ZSM
  → NSM` (Mobile, "FIELD" roles) — PRD §4.
- **Two-stage approval**: Nearest Higher Manager → Admin (HR or Admin for Leave), with read-only
  visibility for anyone above — PRD §7.1, client §19. One `approval` module owns it
  ([`approval.md`](approval.md), [`../hld/05-approval-workflow-engine.md`](../hld/05-approval-workflow-engine.md));
  approvable records carry no status fields of their own. Every LLD doc for a module with an
  approval workflow says so explicitly rather than re-describing the state machine.
