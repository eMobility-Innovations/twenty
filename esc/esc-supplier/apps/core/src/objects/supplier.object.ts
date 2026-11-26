import { defineObject, FieldType } from 'twenty-sdk/define';

import {
  SUPPLIER_ARCHIVED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_ARCHIVED_REASON_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_CONTACT_NAME_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_CREDIT_TRACKER_ID_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_EMAILS_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_LANGUAGE_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_PIM_SUPPLIER_IDX_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_REFERENCE_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_TYPE_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_WHATSAPP_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

// Who we buy from or ship with. Forwarders and couriers are supplier records with their own
// type (Karol, 2026-11-19), so one form or one report can address all three.
export enum SupplierType {
  SUPPLIER = 'SUPPLIER',
  FORWARDER = 'FORWARDER',
  COURIER = 'COURIER',
}

// The language we write to this supplier in; supplier-facing pages open in it.
export enum SupplierLanguage {
  EN = 'EN',
  ZH = 'ZH',
}

// The record every module hangs its own data on. The company name is the built-in `name` field.
export default defineObject({
  universalIdentifier: SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'supplier',
  namePlural: 'suppliers',
  labelSingular: 'Supplier',
  labelPlural: 'Suppliers',
  description: 'A supplier, forwarder or courier the company works with',
  icon: 'IconBuildingFactory2',
  fields: [
    {
      universalIdentifier: SUPPLIER_TYPE_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'supplierType',
      type: FieldType.SELECT,
      label: 'Type',
      description: 'Supplier, forwarder or courier',
      icon: 'IconCategory',
      isNullable: false,
      defaultValue: `'${SupplierType.SUPPLIER}'`,
      options: [
        { value: SupplierType.SUPPLIER, label: 'Supplier', position: 0, color: 'blue' },
        { value: SupplierType.FORWARDER, label: 'Forwarder', position: 1, color: 'orange' },
        { value: SupplierType.COURIER, label: 'Courier', position: 2, color: 'green' },
      ],
    },
    {
      universalIdentifier: SUPPLIER_LANGUAGE_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'language',
      type: FieldType.SELECT,
      label: 'Language',
      description: 'The language we write to this supplier in',
      icon: 'IconLanguage',
      isNullable: false,
      defaultValue: `'${SupplierLanguage.EN}'`,
      options: [
        { value: SupplierLanguage.EN, label: 'English', position: 0, color: 'gray' },
        { value: SupplierLanguage.ZH, label: 'Chinese', position: 1, color: 'red' },
      ],
    },
    {
      universalIdentifier: SUPPLIER_REFERENCE_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'reference',
      type: FieldType.TEXT,
      label: 'Reference',
      description: 'Our own short id for this supplier, for example SUP-014',
      icon: 'IconHash',
      isSearchable: true,
    },
    {
      universalIdentifier: SUPPLIER_CONTACT_NAME_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'contactName',
      type: FieldType.TEXT,
      label: 'Contact person',
      icon: 'IconUser',
    },
    {
      universalIdentifier: SUPPLIER_EMAILS_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'emails',
      type: FieldType.EMAILS,
      label: 'Emails',
      icon: 'IconMail',
    },
    {
      universalIdentifier: SUPPLIER_WHATSAPP_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'whatsapp',
      type: FieldType.PHONES,
      label: 'WhatsApp',
      description: 'WhatsApp number, with the country code',
      icon: 'IconBrandWhatsapp',
    },
    {
      universalIdentifier: SUPPLIER_CREDIT_TRACKER_ID_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'creditTrackerId',
      type: FieldType.NUMBER,
      label: 'Credit Tracker id',
      description:
        'The id of this supplier in the Supplier Credit Tracker; empty for one that is not there',
      icon: 'IconLink',
      universalSettings: { dataType: 'int' },
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier: SUPPLIER_ARCHIVED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'archivedAt',
      type: FieldType.DATE_TIME,
      label: 'Archived at',
      description:
        'When this supplier went out of use; empty while it is in use. A supplier is archived, never deleted.',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier: SUPPLIER_ARCHIVED_REASON_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'archivedReason',
      type: FieldType.TEXT,
      label: 'Archive reason',
      description: "Why it was archived and by what, for example 'Credit Tracker: archived there'.",
      isNullable: true,
    },
    {
      universalIdentifier: SUPPLIER_PIM_SUPPLIER_IDX_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'pimSupplierIdx',
      type: FieldType.TEXT,
      label: 'PIM supplier idx',
      description: 'The idx of this supplier in the PIM Atlas; empty for one that is not there',
      icon: 'IconLink',
      isNullable: true,
      isSearchable: true,
      isUnique: true,
    },
  ],
});
