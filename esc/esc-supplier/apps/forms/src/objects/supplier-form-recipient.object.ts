import { defineObject, FieldType } from 'twenty-sdk/define';

import {
  SUPPLIER_FORM_RECIPIENT_ANSWERED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_RECIPIENT_FIRST_OPENED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_RECIPIENT_LANGUAGE_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_RECIPIENT_LAST_OPENED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_RECIPIENT_LINK_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_RECIPIENT_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_RECIPIENT_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_RECIPIENT_TOKEN_HASH_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

// The languages a form can be answered in.
export enum SupplierFormLanguage {
  EN = 'EN',
  ZH = 'ZH',
}

// Where this recipient is in the campaign.
export enum SupplierFormRecipientStatus {
  NOT_OPENED = 'NOT_OPENED',
  OPENED = 'OPENED',
  ANSWERED = 'ANSWERED',
}

// One supplier in one campaign. The built-in `name` is the company name at the time of the send.
// The link is readable here on purpose (Karol, 2026-11-23): staff copy it and send it by hand.
export default defineObject({
  universalIdentifier: SUPPLIER_FORM_RECIPIENT_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'supplierFormRecipient',
  namePlural: 'supplierFormRecipients',
  labelSingular: 'Form recipient',
  labelPlural: 'Form recipients',
  description: 'One supplier in one campaign, with its personal link',
  icon: 'IconUserCheck',
  fields: [
    {
      universalIdentifier: SUPPLIER_FORM_RECIPIENT_LANGUAGE_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'language',
      type: FieldType.SELECT,
      label: 'Language',
      description: 'The language the form opens in',
      icon: 'IconLanguage',
      isNullable: false,
      defaultValue: `'${SupplierFormLanguage.EN}'`,
      options: [
        { value: SupplierFormLanguage.EN, label: 'English', position: 0, color: 'gray' },
        { value: SupplierFormLanguage.ZH, label: 'Chinese', position: 1, color: 'red' },
      ],
    },
    {
      universalIdentifier: SUPPLIER_FORM_RECIPIENT_LINK_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'personalLink',
      type: FieldType.TEXT,
      label: 'Personal link',
      description: 'The no-login address this recipient opens; anyone holding it can answer for them',
      icon: 'IconLink',
    },
    {
      universalIdentifier: SUPPLIER_FORM_RECIPIENT_TOKEN_HASH_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'tokenHash',
      type: FieldType.TEXT,
      label: 'Link token hash',
      description: 'SHA-256 of the link token; the page finds the recipient by it',
      icon: 'IconFingerprint',
    },
    {
      universalIdentifier: SUPPLIER_FORM_RECIPIENT_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'status',
      type: FieldType.SELECT,
      label: 'Status',
      icon: 'IconProgressCheck',
      isNullable: false,
      defaultValue: `'${SupplierFormRecipientStatus.NOT_OPENED}'`,
      options: [
        { value: SupplierFormRecipientStatus.NOT_OPENED, label: 'Not opened', position: 0, color: 'gray' },
        { value: SupplierFormRecipientStatus.OPENED, label: 'Opened', position: 1, color: 'orange' },
        { value: SupplierFormRecipientStatus.ANSWERED, label: 'Answered', position: 2, color: 'green' },
      ],
    },
    {
      universalIdentifier: SUPPLIER_FORM_RECIPIENT_FIRST_OPENED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'firstOpenedAt',
      type: FieldType.DATE_TIME,
      label: 'First opened',
      icon: 'IconEye',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier: SUPPLIER_FORM_RECIPIENT_LAST_OPENED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'lastOpenedAt',
      type: FieldType.DATE_TIME,
      label: 'Last opened',
      icon: 'IconEye',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier: SUPPLIER_FORM_RECIPIENT_ANSWERED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'answeredAt',
      type: FieldType.DATE_TIME,
      label: 'Answered',
      description: 'When the latest answer arrived',
      icon: 'IconCheck',
      isNullable: true,
      defaultValue: null,
    },
  ],
});
