import { SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/constants/core-identifiers';
import formsRecipientsOnSupplier from 'src/fields/forms-recipients-on-supplier.field';
import supplierOnRecipient from 'src/fields/supplier-on-supplier-form-recipient.field';
import answer from 'src/objects/supplier-form-answer.object';
import campaign, { SupplierFormCampaignStatus } from 'src/objects/supplier-form-campaign.object';
import recipient, {
  SupplierFormLanguage,
  SupplierFormRecipientStatus,
} from 'src/objects/supplier-form-recipient.object';
import form, { SupplierFormStatus } from 'src/objects/supplier-form.object';
import { describe, expect, it } from 'vitest';

type Field = { name: string; options?: { value: string }[] | null };
const optionValues = (object: { config: { fields?: readonly unknown[] } }, name: string) =>
  ((object.config.fields ?? []) as Field[])
    .find((f) => f.name === name)
    ?.options?.map((o) => o.value) ?? [];

describe('forms module objects', () => {
  it.each([
    ['supplierForm', 'supplierForms', form],
    ['supplierFormCampaign', 'supplierFormCampaigns', campaign],
    ['supplierFormRecipient', 'supplierFormRecipients', recipient],
    ['supplierFormAnswer', 'supplierFormAnswers', answer],
  ])('should define %s without errors', (singular, plural, object) => {
    expect(object.errors).toEqual([]);
    expect(object.warnings).toEqual([]);
    expect(object.config.nameSingular).toBe(singular);
    expect(object.config.namePlural).toBe(plural);
  });

  it('should offer the statuses the logic reads', () => {
    expect(optionValues(form, 'status')).toEqual(Object.values(SupplierFormStatus));
    expect(optionValues(campaign, 'status')).toEqual(Object.values(SupplierFormCampaignStatus));
    expect(optionValues(recipient, 'status')).toEqual(Object.values(SupplierFormRecipientStatus));
    expect(optionValues(recipient, 'language')).toEqual(Object.values(SupplierFormLanguage));
  });

  it('should hang recipients on the core supplier from inside this module', () => {
    expect(supplierOnRecipient.errors).toEqual([]);
    expect(formsRecipientsOnSupplier.errors).toEqual([]);
    expect(formsRecipientsOnSupplier.config.objectUniversalIdentifier).toBe(
      SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
    );
    expect(formsRecipientsOnSupplier.config.name).toBe('formsRecipients');
  });
});
