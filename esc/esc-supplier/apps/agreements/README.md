# ESC Supplier — Agreements: the agreements module of the supplier CRM

One module for **every** commercial agreement with a supplier, as its own Twenty App next to the core app.
A supplier has zero or more agreements; an agreement has zero or more commitments. A milestone is a commitment with a date, so there is one child object, not two.
Module contract: [`../../AGENTS.md`](../../AGENTS.md). Redmine: #27634 (umbrella #27542).

**Decisions (Karol, 24 Nov 2026):** payment terms and the credit limit are NOT here — they live on the supplier,
in another module. Out of use, an agreement or commitment gets `archivedAt` and is kept, never deleted.
`performanceReviewedOn` / `agreementReviewedOn` hold the last review dates (3-month performance, 9-month
agreement); a later reminders job reads them. The app keeps no roles for people.

## `supplierAgreement` fields

| Field | Type | Meaning |
|---|---|---|
| `name` (built-in) | text | The title, for example "KingSong UK MOU" |
| `agreementType` | select | MOU, Distribution, Consignment, Display or Warranty (default MOU) |
| `startDate` | date | When this agreement comes into force |
| `endDate` | date | When it ends; empty while it is open-ended |
| `warrantyResponseDays` | number (int) | The agreed response time for a warranty case, in days |
| `warrantyLabourPaidBy` | text | Who pays for warranty labour, for example "supplier" or "us" |
| `warrantyReplacementTerms` | text | The agreed replacement terms for a warranty case |
| `performanceReviewedOn` | date | The date of the last 3-month performance review |
| `agreementReviewedOn` | date | The date of the last 9-month agreement review |
| `notes` | text | Free text on this agreement |
| `archivedAt` | date-time | When it went out of use; empty while it is in force |
| `supplier` | relation | The supplier it is with (see the relations below) |

## `supplierAgreementCommitment` fields

| Field | Type | Meaning |
|---|---|---|
| `name` (built-in) | text | The title of the commitment |
| `kind` | select | Unit target, Delivery deadline, Price point, Exclusivity, Milestone or Other (default Other) |
| `startDate` | date | Where a unit target starts counting |
| `dueDate` | date | When this commitment is due; a milestone is a commitment with a date |
| `targetUnits` | number (int) | The number of units this commitment covers |
| `amount` | currency | The money this commitment covers |
| `details` | text | Free text on this commitment |
| `completedAt` | date-time | When this commitment was completed |
| `archivedAt` | date-time | When it went out of use; empty while it is live |
| `agreement` | relation | The agreement it belongs to (see the relations below) |

## Relations (both declared in this module; both leave with it)

- `supplierAgreement.supplier` → core `supplier` (many-to-one, **SET_NULL**): the supplier it is
  with; reverse field `agreementsRecords` on the core `supplier`. Deleting the supplier never
  deletes its agreements.
- `supplierAgreementCommitment.agreement` → `supplierAgreement` (many-to-one, **SET_NULL**): the
  agreement it belongs to; reverse field `commitments` on `supplierAgreement`. Deleting the
  agreement never deletes its commitments.

## Views and navigation

| View | Filter | First columns |
|---|---|---|
| **Agreements in force** | `archivedAt` is empty | name, supplier, agreement type, start date, end date |
| **All agreements** | none | the same, plus `archivedAt` |
| **Commitments due** | `completedAt` is empty **and** `archivedAt` is empty | name, agreement, kind, due date, target units |
| **All commitments** | none | the same, plus start date, amount, `completedAt`, `archivedAt` |

Two navigation menu items, each pointing at the curated view, not the bare object: **Agreements** opens "Agreements in force" and **Commitments** opens "Commitments due".

## Attaching signed documents

A signed document (for example the MOU) goes on the agreement's own record page, tab **Files**.
Twenty gives every object its standard record tabs (Timeline, Tasks, Notes, Files), so the module
declares no file field. Seen on esc-supplier on 25 Nov 2026: the agreement page shows the Files
tab and the API returns an `attachments` relation on `supplierAgreement`. An actual upload was not
done in that check.

Twenty also creates its own default views "All Agreements" and "All Commitments" next to the
module's "All agreements" and "All commitments".

## Taking the module out of use

The steps are in the module contract, [`../../AGENTS.md`](../../AGENTS.md), two directories up; its
objects and their records leave with the app, so export them first if anyone still needs them.
