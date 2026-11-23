import { defineObject, FieldType } from 'twenty-sdk/define';

import {
  SUPPLIER_FORM_ANSWER_ANSWERS_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_ANSWER_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_ANSWER_SUBMITTED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_ANSWER_SUMMARY_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

// One submission. Append-only: a correction is a NEW record and an existing one is never edited,
// so the history of what a supplier told us stays intact. Twenty cannot refuse an edit by a
// workspace member here; every edit shows in the record's timeline.
// The built-in `name` is "<company> — <submitted at>".
export default defineObject({
  universalIdentifier: SUPPLIER_FORM_ANSWER_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'supplierFormAnswer',
  namePlural: 'supplierFormAnswers',
  labelSingular: 'Form answer',
  labelPlural: 'Form answers',
  description: 'One submission of a form by one recipient',
  icon: 'IconChecklist',
  fields: [
    {
      universalIdentifier: SUPPLIER_FORM_ANSWER_SUBMITTED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'submittedAt',
      type: FieldType.DATE_TIME,
      label: 'Submitted',
      icon: 'IconClock',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier: SUPPLIER_FORM_ANSWER_ANSWERS_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'answers',
      type: FieldType.RAW_JSON,
      label: 'Answers',
      description: 'The answers exactly as they were accepted',
      icon: 'IconBraces',
    },
    {
      universalIdentifier: SUPPLIER_FORM_ANSWER_SUMMARY_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'summary',
      type: FieldType.TEXT,
      label: 'Summary',
      description: 'The answers as readable text',
      icon: 'IconAlignLeft',
    },
  ],
});
