import { STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS, SystemPermissionFlag } from 'twenty-sdk/define';
import {
  SUPPLIER_AGREEMENT_COMMITMENT_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_AGREEMENT_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_ANSWER_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_RECIPIENT_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_LIFECYCLE_NEGOTIATION_NOTES_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_LIFECYCLE_PENDING_DECISION_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_LIFECYCLE_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_LIFECYCLE_TRIAGE_DATE_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_LIFECYCLE_TRIAGE_FIT_SIGNAL_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_LIFECYCLE_TRIAGE_SCORE_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/module-identifiers';
import defaultRoleDefinition from 'src/default-role';
import ecomRoleDefinition from 'src/roles/ecom.role';
import { describe, expect, it } from 'vitest';

// defineRole and defineApplicationRole each return a union over the SDK's role shapes, so a
// narrow helper fails the typecheck. These tests read both through one loose shape.
type RoleObjectEntry = {
  objectUniversalIdentifier: string;
  canReadAllRecords: boolean;
  canCreateAllRecords: boolean;
  canUpdateAllRecords: boolean;
  canSoftDeleteAllRecords: boolean;
  canDestroyAllRecords: boolean;
  uneditableFields?: string[];
};
type RoleRecord = {
  label: string;
  canUpdateAllSettings: boolean;
  canBeAssignedToUsers: boolean;
  canBeAssignedToApiKeys: boolean;
  canBeAssignedToAgents: boolean;
  permissionFlagUniversalIdentifiers?: string[];
  recordsPermissions: {
    canReadAllRecords: boolean;
    canUpdateAllRecords: boolean;
    canSoftDeleteAllRecords: boolean;
    canDestroyAllRecords: boolean;
    objects?: RoleObjectEntry[];
  };
};
type RoleDefinition = { config: RoleRecord };
const read = (role: unknown) => role as RoleDefinition;

const ecom = read(ecomRoleDefinition);
const accessDefaultRole = read(defaultRoleDefinition);
const byIdentifier = (definition: RoleDefinition, identifier: string) =>
  (definition.config.recordsPermissions.objects ?? []).find(
    (object) => object.objectUniversalIdentifier === identifier,
  );

describe('ecom role', () => {
  it('should be the Ecom role, assignable to users and API keys but not agents', () => {
    expect(ecom.config.label).toBe('Ecom');
    expect(ecom.config.canBeAssignedToUsers).toBe(true);
    expect(ecom.config.canBeAssignedToApiKeys).toBe(true);
    expect(ecom.config.canBeAssignedToAgents).toBe(false);
    expect(ecom.config.canUpdateAllSettings).toBe(false);
  });

  it('should read all records at the top level and grant no write or delete', () => {
    expect(ecom.config.recordsPermissions.canReadAllRecords).toBe(true);
    expect(ecom.config.recordsPermissions.canUpdateAllRecords).toBe(false);
    expect(ecom.config.recordsPermissions.canSoftDeleteAllRecords).toBe(false);
    expect(ecom.config.recordsPermissions.canDestroyAllRecords).toBe(false);
  });

  it('should grant no delete on any object entry', () => {
    for (const object of ecom.config.recordsPermissions.objects ?? []) {
      expect(object.canSoftDeleteAllRecords).toBe(false);
      expect(object.canDestroyAllRecords).toBe(false);
    }
  });

  it('should grant read, create and update on the core supplier object', () => {
    const supplier = byIdentifier(ecom, SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER);
    expect(supplier).toBeDefined();
    expect(supplier!.canReadAllRecords).toBe(true);
    expect(supplier!.canCreateAllRecords).toBe(true);
    expect(supplier!.canUpdateAllRecords).toBe(true);
  });

  it('should lock exactly the six lifecycle fields on the supplier object', () => {
    const supplier = byIdentifier(ecom, SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER)!;
    const locked = (supplier.uneditableFields ?? []).slice().sort();
    const expected = [
      SUPPLIER_LIFECYCLE_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
      SUPPLIER_LIFECYCLE_TRIAGE_SCORE_FIELD_UNIVERSAL_IDENTIFIER,
      SUPPLIER_LIFECYCLE_TRIAGE_FIT_SIGNAL_FIELD_UNIVERSAL_IDENTIFIER,
      SUPPLIER_LIFECYCLE_TRIAGE_DATE_FIELD_UNIVERSAL_IDENTIFIER,
      SUPPLIER_LIFECYCLE_NEGOTIATION_NOTES_FIELD_UNIVERSAL_IDENTIFIER,
      SUPPLIER_LIFECYCLE_PENDING_DECISION_FIELD_UNIVERSAL_IDENTIFIER,
    ].sort();
    expect(locked).toHaveLength(6);
    expect(locked).toEqual(expected);
  });

  it('should grant read, create and update on each of the four forms objects', () => {
    const identifiers = [
      SUPPLIER_FORM_OBJECT_UNIVERSAL_IDENTIFIER,
      SUPPLIER_FORM_CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
      SUPPLIER_FORM_RECIPIENT_OBJECT_UNIVERSAL_IDENTIFIER,
      SUPPLIER_FORM_ANSWER_OBJECT_UNIVERSAL_IDENTIFIER,
    ];
    for (const identifier of identifiers) {
      const object = byIdentifier(ecom, identifier);
      expect(object).toBeDefined();
      expect(object!.canReadAllRecords).toBe(true);
      expect(object!.canCreateAllRecords).toBe(true);
      expect(object!.canUpdateAllRecords).toBe(true);
    }
  });

  it('should grant read-only on the agreement and commitment objects', () => {
    const identifiers = [
      SUPPLIER_AGREEMENT_OBJECT_UNIVERSAL_IDENTIFIER,
      SUPPLIER_AGREEMENT_COMMITMENT_OBJECT_UNIVERSAL_IDENTIFIER,
    ];
    for (const identifier of identifiers) {
      const object = byIdentifier(ecom, identifier);
      expect(object).toBeDefined();
      expect(object!.canReadAllRecords).toBe(true);
      expect(object!.canCreateAllRecords).toBe(false);
      expect(object!.canUpdateAllRecords).toBe(false);
    }
  });

  it('should grant read, create and update on the standard note, task and attachment objects', () => {
    const identifiers = [
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.note.universalIdentifier,
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.task.universalIdentifier,
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.noteTarget.universalIdentifier,
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.taskTarget.universalIdentifier,
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.attachment.universalIdentifier,
    ];
    for (const identifier of identifiers) {
      const object = byIdentifier(ecom, identifier);
      expect(object).toBeDefined();
      expect(object!.canReadAllRecords).toBe(true);
      expect(object!.canCreateAllRecords).toBe(true);
      expect(object!.canUpdateAllRecords).toBe(true);
    }
  });

  it('should grant read, create and update on the supplier product object', () => {
    const object = byIdentifier(ecom, SUPPLIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER);
    expect(object).toBeDefined();
    expect(object!.canReadAllRecords).toBe(true);
    expect(object!.canCreateAllRecords).toBe(true);
    expect(object!.canUpdateAllRecords).toBe(true);
  });

  it('should grant exactly the upload and download file permission flags', () => {
    expect((ecom.config.permissionFlagUniversalIdentifiers ?? []).slice().sort()).toEqual(
      [SystemPermissionFlag.UPLOAD_FILE, SystemPermissionFlag.DOWNLOAD_FILE].sort(),
    );
  });

  it('should list exactly thirteen objects, each once', () => {
    const objects = ecom.config.recordsPermissions.objects ?? [];
    expect(objects).toHaveLength(13);
    const identifiers = objects.map((object) => object.objectUniversalIdentifier);
    expect(new Set(identifiers).size).toBe(13);
  });
});

describe('access default function role', () => {
  it('should grant no record access and be assignable to nobody', () => {
    expect(accessDefaultRole.config.recordsPermissions.canReadAllRecords).toBe(false);
    expect(accessDefaultRole.config.recordsPermissions.canUpdateAllRecords).toBe(false);
    expect(accessDefaultRole.config.recordsPermissions.canSoftDeleteAllRecords).toBe(false);
    expect(accessDefaultRole.config.recordsPermissions.canDestroyAllRecords).toBe(false);
    expect(accessDefaultRole.config.canBeAssignedToUsers).toBe(false);
    expect(accessDefaultRole.config.canBeAssignedToApiKeys).toBe(false);
    expect(accessDefaultRole.config.canBeAssignedToAgents).toBe(false);
  });
});
