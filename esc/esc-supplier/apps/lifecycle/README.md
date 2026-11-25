# Lifecycle module (RM #27634)

## What the module owns

The module owns **no objects**. It adds six `lifecycle*` fields to the core `supplier` object
and three views on that object. It keeps only its default application role and defines no roles
for people. Who changed what and when is read from Twenty's record timeline, so the module has
no audit object.

## Fields

All six fields are added to the core `supplier` object.

| Name | Type | Label | Meaning |
|---|---|---|---|
| `lifecycleStatus` | SELECT | Status | Where this supplier stands with us: Parked, Onboarding, Active, Under review. Empty until someone sets it. |
| `lifecycleTriageScore` | NUMBER (int) | Gap/overlap score | The score from triaging this supplier against the current base. Entered by hand in v1. |
| `lifecycleTriageFitSignal` | TEXT | Fit signal | The signal from triage that says how well this supplier fits the current base. Entered by hand in v1. |
| `lifecycleTriageDate` | DATE | Triage date | When this supplier was triaged. Entered by hand in v1. |
| `lifecycleNegotiationNotes` | RICH_TEXT | Negotiation notes | Notes from the negotiation with this supplier. |
| `lifecyclePendingDecision` | TEXT | Pending decision | The decision for this supplier that is still open. |

The status has exactly four values. Triage values are entered by hand in v1; nothing fills them
automatically yet.

## Views

| View | Columns | Filters |
|---|---|---|
| Suppliers by status | Name, Status, Triage date, Pending decision | core `archivedAt` is empty (historical suppliers stay out) |
| Parked suppliers (triage) | Name, Gap/overlap score, Fit signal, Triage date, Pending decision | core `archivedAt` is empty, and Status is Parked |
| Historical suppliers | Name, core `archivedAt`, core `archivedReason`, Status | core `archivedAt` is not empty |

## Historical is core archivedAt

A supplier is Historical when the core field `archivedAt` is filled. That field is the single
source of truth. The status has no Historical value, and no second flag is kept for it.

## Taking the module out of use

The steps are in the module contract (the AGENTS.md two directories up, its section on
installing a module and taking one out). The six fields and their values leave the supplier
record together with the app, so export them first if anyone still needs them.
