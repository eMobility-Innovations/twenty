# Access app (RM #27634)

## What this app is

The access app holds the roles for the people of the supplier CRM. A role says what a member
may do to the objects of the whole workspace, so it cannot live inside one module: a member
holds exactly one role, and a role for people names objects of several modules. Like core, the
access app is not a module and is never removed. It holds roles only, plus a default function
role that grants nothing: no objects, fields or views.

## What the role Ecom may do

The role `Ecom` is for the Ecom team. It is assigned to people, and it can be assigned to an
API key for testing.

| What | Grant |
|---|---|
| Supplier basic data | edit: read, create, update (the `supplier` object) |
| The four forms objects | edit: read, create, update |
| Notes, tasks and files on a record | edit: read, create, update; files can be uploaded and downloaded |
| The six `lifecycle*` fields | read only (status, the triage score and fit signal, triage date, negotiation notes, pending decision) |
| The agreements and their commitments | read only (the two agreement objects) |
| Supplier products (the price list, module `products`) | edit: read, create, update |

The role holds no grant beyond read, create and update on any object. It never soft-deletes or
destroys a record, so a record that goes out of use is archived through its archive field, not
deleted.

## How a person gets the role

An Admin assigns it in the browser: Settings, Members. A role for a person cannot be set through
an API key.

## When a module leaves the workspace

Take the module's section out of `src/constants/module-identifiers.ts` and the module's entries
out of the role in the same pull request. The gate refuses a leftover section, and the app's
typecheck a leftover use in a role.

## Applying

See the "Applying" section of the core app's README. The first apply is done with `--create`.
