# ESC Supplier — Products: the supplier products module of the supplier CRM

One module for the products that suppliers offer under our SKUs, as its own Twenty App next to the core app.
It owns the `supplierProduct` object — what one supplier offers under one of our SKUs, with its cost — its relation
to the core `supplier`, and its views.
Module contract: [`../../AGENTS.md`](../../AGENTS.md). Redmine: #28117 (umbrella #27542).

Field names follow the PIM Atlas model `SourceProduct` (`external_id` = `supplierCode`, `name`, `cost`, currency),
so one row is kept per supplier and supplier code. The app has not yet been applied to the CRM.

## supplierProduct fields

| Field | Type | Meaning |
|---|---|---|
| `name` (built-in) | text | The product name at the supplier |
| `supplierCode` | text | The supplier's own product code; when the supplier has no code of its own, our SKU is written here |
| `sku` | text | Our SKU |
| `cost` | currency | What the supplier charges us for one unit |
| `costValidFrom` | date | The date from which this cost holds |
| `productKey` | text, unique | The text `<the supplier's pimSupplierIdx>:<supplierCode>`; the one unique field, by which a CSV import finds an existing row |
| `notes` | text | Free text on this product |
| `archivedAt` | date-time | When this row went out of use; empty while in use |
| `supplier` | relation | The supplier this product is offered by (see the relation below) |

The object has no `source` field.

## Relation

- `supplierProduct.supplier` → core `supplier` (many-to-one, **SET_NULL**): the supplier this product is offered by;
  reverse field `productsRecords` on the core `supplier` (one-to-many). Both fields are declared in this module,
  and both leave with it. Deleting the supplier never deletes its products.

## Views and navigation

| View | Filter | Columns |
|---|---|---|
| **Supplier products** | `archivedAt` is empty | name, supplier, supplierCode, sku, cost, costValidFrom |
| **Products without a cost** | `cost` is empty **and** `archivedAt` is empty | the same |
| **Products without a key** | `productKey` is empty **and** `archivedAt` is empty | the same, plus productKey |
| **Archived supplier products** | `archivedAt` is not empty | name, supplier, supplierCode, sku, archivedAt |

One navigation menu item, **Supplier products**, opens the first view.

## Changing a price

A price is changed by editing the row, or by importing it again with the same `productKey`.
The row keeps its history: after a change, the record timeline shows the value before, who changed it, and when.
There is no second row for the same supplier and code.

## CSV import

The CSV has these columns: name, supplier code, SKU, `Amount (cost)`, `Currency (cost)`, cost valid from,
product key, `Supplier / PIM supplier idx`, notes.

- `productKey` is the text `<the supplier's pimSupplierIdx>:<supplierCode>`, for example `12:ABC-123`.
- Twenty's CSV import finds an existing row by a unique field and overwrites it. A re-import with the same
  `productKey` changes the price instead of adding a second row.
- A currency field has two columns: `Amount (cost)` takes the amount in normal units (12.50, not micros), and
  `Currency (cost)` takes the code (GBP, EUR, USD, CNY).
- The `Supplier / PIM supplier idx` column matches the row to the core supplier by `pimSupplierIdx`. That core
  field is not unique yet; a separate change to the core app marks it unique. Only after that can the import
  match the supplier by this column.
- When the supplier has no code of its own, our SKU is written in `supplierCode`.

## Archive, never remove

A row out of use gets `archivedAt` and stays. The view **Archived supplier products** lists these rows.

## Taking the module out of the workspace

The steps are in the module contract, [`../../AGENTS.md`](../../AGENTS.md). The object and its rows leave with
the app, so export them first if anyone still needs them.
