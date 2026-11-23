import { defineObject, FieldType } from 'twenty-sdk/define';

import {
  SUPPLIER_FORM_DEFINITION_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_FORM_KEY_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_VERSION_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

// Only a PUBLISHED version is served to recipients.
export enum SupplierFormStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  RETIRED = 'RETIRED',
}

// One VERSION of one form. A published version is never edited: a change is a new record with
// `version` + 1, so every answer stays readable against the questions that were asked.
// The built-in `name` is the form's title.
export default defineObject({
  universalIdentifier: SUPPLIER_FORM_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'supplierForm',
  namePlural: 'supplierForms',
  labelSingular: 'Supplier form',
  labelPlural: 'Supplier forms',
  description: 'One version of one supplier form: its questions as data',
  icon: 'IconForms',
  fields: [
    {
      universalIdentifier: SUPPLIER_FORM_FORM_KEY_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'formKey',
      type: FieldType.TEXT,
      label: 'Form key',
      description: 'Stable key shared by every version of this form, for example christmas-2026-dates',
      icon: 'IconKey',
      isSearchable: true,
    },
    {
      universalIdentifier: SUPPLIER_FORM_VERSION_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'version',
      type: FieldType.NUMBER,
      label: 'Version',
      icon: 'IconVersions',
      universalSettings: { dataType: 'int' },
      isNullable: false,
      defaultValue: 1,
    },
    {
      universalIdentifier: SUPPLIER_FORM_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'status',
      type: FieldType.SELECT,
      label: 'Status',
      icon: 'IconProgressCheck',
      isNullable: false,
      defaultValue: `'${SupplierFormStatus.DRAFT}'`,
      options: [
        { value: SupplierFormStatus.DRAFT, label: 'Draft', position: 0, color: 'gray' },
        { value: SupplierFormStatus.PUBLISHED, label: 'Published', position: 1, color: 'green' },
        { value: SupplierFormStatus.RETIRED, label: 'Retired', position: 2, color: 'orange' },
      ],
    },
    {
      universalIdentifier: SUPPLIER_FORM_DEFINITION_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'definition',
      type: FieldType.RAW_JSON,
      label: 'Definition',
      description: 'Sections, fields, labels per language, validators by name and the reference data the form shows',
      icon: 'IconBraces',
    },
  ],
});
