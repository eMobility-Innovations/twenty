# ESC Supplier — Forms: the forms module of the supplier CRM

One module for **every** supplier form (dates, lead times, onboarding, …), as its own Twenty App
next to the core app. A form is **data**, never a page of its own: a new questionnaire is a new
`supplierForm` record, not a code change here. Module contract: [`../../AGENTS.md`](../../AGENTS.md).
Redmine: #27891 (umbrella #27542).

## What it holds

| Object | What |
|---|---|
| `supplierForm` | One **version** of one form: `formKey`, `version`, `status` (draft / published / retired) and `definition` (sections, fields, labels per language, validators by name, reference data). A published version is never edited; a change is a new record with `version` + 1. |
| `supplierFormCampaign` | One send of one form version: `form`, `status` (draft / open / closed), `deadline` (personal links stop working then), `parameters` (values this send gives the form, e.g. the allowed date range). |
| `supplierFormRecipient` | One supplier in one campaign: `campaign`, `supplier` (the core record), `language`, `personalLink` (the personal no-login address, readable on purpose so staff can send it by hand), `tokenHash`, `status` (not opened / opened / answered), `firstOpenedAt`, `lastOpenedAt`, `answeredAt`. |
| `supplierFormAnswer` | One submission: `recipient`, `form` (the exact version answered), `submittedAt`, `answers` (as accepted), `summary` (readable text). **Append-only**: a correction is a new record. |

The module adds one field to the core `supplier` object, `formsRecipients`; it leaves with the module.

Relations use `SET_NULL`, so deleting a campaign or a supplier never deletes answers.

## The key twenty-ingest uses

`src/roles/forms-ingest.role.ts` is the role for the API key of twenty-ingest ("ESC Supplier —
Forms ingest", assignable to API keys only). It reads and adds suppliers and forms records,
updates only form versions (to retire one) and recipients (status, timestamps), cannot change
or delete an answer, and reaches nothing else in the workspace. twenty-ingest answers the
no-login page, so its key is never an Admin key.

**Limit:** a workspace member can still edit an answer by hand (an object locked against every
edit is also locked against the key that writes it). Any such edit shows in the record's
timeline.

## Where the logic is

`twenty-ingest`, `src/supplier/forms/`: the no-login page built from the definition, the link
checks, the validators and the answer write, behind the switch `supplier.forms.enabled`.
Nothing here runs code.

## Working on it

Same as core: [`../core/README.md`](../core/README.md) → "Working on it" and "Applying" (from
CT175, core first). Adding, changing or taking this module out: [`../../AGENTS.md`](../../AGENTS.md).
Identifiers live in `src/constants/universal-identifiers.ts` and are never changed; the core
identifier this module uses is copied into `src/constants/core-identifiers.ts`.
