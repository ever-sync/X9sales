import type { ReactNode } from 'react';
import { usePermissions } from '../../hooks/usePermissions';
import type { Permission } from '../../hooks/usePermissions';
import type { AppRole } from '../../types';

interface PermissionGateProps {
  children: ReactNode;
  permission?: Permission;
  permissions?: Permission[];
  requireAll?: boolean;
  roles?: AppRole[];
  minRole?: AppRole;
  fallback?: ReactNode;
}

export function PermissionGate({
  children,
  permission,
  permissions,
  requireAll = false,
  roles,
  minRole,
  fallback = null,
}: PermissionGateProps) {
  const { can, canAny, canAll, isRole, isAtLeast, isLoading } = usePermissions();

  if (isLoading) return null;

  // Check single permission
  if (permission && !can(permission)) return <>{fallback}</>;

  // Check multiple permissions
  if (permissions) {
    const hasAccess = requireAll ? canAll(permissions) : canAny(permissions);
    if (!hasAccess) return <>{fallback}</>;
  }

  // Check roles
  if (roles && !isRole(roles)) return <>{fallback}</>;

  // Check minimum role level
  if (minRole && !isAtLeast(minRole)) return <>{fallback}</>;

  return <>{children}</>;
}
