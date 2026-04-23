import { useCallback } from 'react';
import { useCompany } from '../contexts/CompanyContext';
import type { AppRole, Permission } from '../config/rbac';
import { DEFAULT_PERMISSIONS, ROLE_LEVELS } from '../config/rbac';

interface UsePermissionsReturn {
  role: AppRole | null;
  isLoading: boolean;
  can: (permission: Permission) => boolean;
  canAny: (permissions: Permission[]) => boolean;
  canAll: (permissions: Permission[]) => boolean;
  isRole: (roles: AppRole | AppRole[]) => boolean;
  isAtLeast: (minRole: AppRole) => boolean;
}

export type { Permission } from '../config/rbac';

export function usePermissions(): UsePermissionsReturn {
  const { role, isLoading } = useCompany();

  const can = useCallback(
    (permission: Permission): boolean => {
      if (!role) return false;
      return DEFAULT_PERMISSIONS[role]?.[permission] ?? false;
    },
    [role]
  );

  const canAny = useCallback(
    (permissions: Permission[]): boolean => permissions.some(p => can(p)),
    [can]
  );

  const canAll = useCallback(
    (permissions: Permission[]): boolean => permissions.every(p => can(p)),
    [can]
  );

  const isRole = useCallback(
    (roles: AppRole | AppRole[]): boolean => {
      if (!role) return false;
      const arr = Array.isArray(roles) ? roles : [roles];
      return arr.includes(role);
    },
    [role]
  );

  const isAtLeast = useCallback(
    (minRole: AppRole): boolean => {
      if (!role) return false;
      return (ROLE_LEVELS[role] ?? 0) >= (ROLE_LEVELS[minRole] ?? 999);
    },
    [role]
  );

  return { role, isLoading, can, canAny, canAll, isRole, isAtLeast };
}
