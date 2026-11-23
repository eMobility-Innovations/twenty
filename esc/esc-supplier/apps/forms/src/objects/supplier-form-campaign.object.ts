import { defineObject, FieldType } from 'twenty-sdk/define';

import {
  SUPPLIER_FORM_CAMPAIGN_DEADLINE_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_CAMPAIGN_PARAMETERS_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_CAMPAIGN_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

// Links answer only while the campaign is OPEN.
export enum SupplierFormCampaignStatus {
  DRAFT = 'DRAFT',
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

// One send of one form version. The built-in `name` is the campaign's title.
export default defineObject({
  universalIdentifier: SUPPLIER_FORM_CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'supplierFormCampaign',
  namePlural: 'supplierFormCampaigns',
  labelSingular: 'Form campaign',
  labelPlural: 'Form campaigns',
  description: 'One send of one form version to a list of recipients',
  icon: 'IconSend',
  fields: [
    {
      universalIdentifier: SUPPLIER_FORM_CAMPAIGN_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'status',
      type: FieldType.SELECT,
      label: 'Status',
      icon: 'IconProgressCheck',
      isNullable: false,
      defaultValue: `'${SupplierFormCampaignStatus.DRAFT}'`,
      options: [
        { value: SupplierFormCampaignStatus.DRAFT, label: 'Draft', position: 0, color: 'gray' },
        { value: SupplierFormCampaignStatus.OPEN, label: 'Open', position: 1, color: 'green' },
        { value: SupplierFormCampaignStatus.CLOSED, label: 'Closed', position: 2, color: 'orange' },
      ],
    },
    {
      universalIdentifier: SUPPLIER_FORM_CAMPAIGN_DEADLINE_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'deadline',
      type: FieldType.DATE_TIME,
      label: 'Deadline',
      description: 'Personal links stop working at this moment',
      icon: 'IconCalendarDue',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier: SUPPLIER_FORM_CAMPAIGN_PARAMETERS_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'parameters',
      type: FieldType.RAW_JSON,
      label: 'Parameters',
      description: 'Values this send gives the form, for example the allowed date range and the deadline wording per language',
      icon: 'IconAdjustments',
    },
  ],
});
