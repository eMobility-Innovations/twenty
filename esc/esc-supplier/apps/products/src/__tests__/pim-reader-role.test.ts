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

describe('pim reader role', () => {
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

  it('should read exactly the supplier and supplier product objects, and write nothing', () => {
    expect(objects.map((entry) => entry.objectUniversalIdentifier).sort()).toEqual(
      [SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER, SUPPLIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER].sort(),
    );
    for (const entry of objects) {
      expect(entry).toMatchObject({
        canReadAllRecords: true,
        canCreateAllRecords: false,
        canUpdateAllRecords: false,
        canSoftDeleteAllRecords: false,
        canDestroyAllRecords: false,
      });
    }
  });
});
