import { SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/constants/core-identifiers';
import { SUPPLIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import pimReaderRoleDefinition from 'src/roles/pim-reader.role';
import { describe, expect, it } from 'vitest';

type RoleObjectEntry = {
  objectUniversalIdentifier: string;
  canReadAllRecords: boolean;
  canCreateAllRecords: boolean;
  canUpdateAllRecords: boolean;
  canSoftDeleteAllRecords: boolean;
  canDestroyAllRecords: boolean;
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

const role = (pimReaderRoleDefinition as unknown as { config: RoleRecord }).config;
const objects = role.recordsPermissions.objects ?? [];

describe('pim sync role', () => {
  it('should carry the pim sync label', () => {
    expect(role.label).toBe('ESC Supplier — PIM sync');
  });
  it('should be assignable to API keys only', () => {
    expect(role.canBeAssignedToApiKeys).toBe(true);
    expect(role.canBeAssignedToUsers).toBe(false);
    expect(role.canBeAssignedToAgents).toBe(false);
    expect(role.canUpdateAllSettings).toBe(false);
    expect(role.permissionFlagUniversalIdentifiers ?? []).toEqual([]);
  });

  it('should grant nothing at the top level', () => {
    expect(role.recordsPermissions).toMatchObject({
      canReadAllRecords: false,
      canUpdateAllRecords: false,
      canSoftDeleteAllRecords: false,
      canDestroyAllRecords: false,
    });
  });

  it('should name exactly the supplier and supplier product objects', () => {
    expect(objects.map((entry) => entry.objectUniversalIdentifier).sort()).toEqual(
      [SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER, SUPPLIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER].sort(),
    );
  });

  it('should grant read only on the supplier object', () => {
    expect(objects.find((entry) => entry.objectUniversalIdentifier === SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER)).toEqual({
      objectUniversalIdentifier: SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
      canReadAllRecords: true,
      canCreateAllRecords: false,
      canUpdateAllRecords: false,
      canSoftDeleteAllRecords: false,
      canDestroyAllRecords: false,
    });
  });

  it('should grant read and update only on the supplier product object', () => {
    expect(objects.find((entry) => entry.objectUniversalIdentifier === SUPPLIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER)).toEqual({
      objectUniversalIdentifier: SUPPLIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
      canReadAllRecords: true,
      canCreateAllRecords: false,
      canUpdateAllRecords: true,
      canSoftDeleteAllRecords: false,
      canDestroyAllRecords: false,
    });
  });
});
