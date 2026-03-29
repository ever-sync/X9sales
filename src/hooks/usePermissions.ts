import { useCallback } from 'react';
import { useCompany } from '../contexts/CompanyContext';
import type { AppRole } from '../types';
import { ROLE_LEVELS } from '../config/constants';

export type Permission =
  | 'dashboard.view'
  | 'agents.view_all'
  | 'agents.view_team'
  | 'agents.view_own'
  | 'conversations.view_all'
  | 'conversations.view_team'
  | 'conversations.view_own'
  | 'metrics.view_all'
  | 'metrics.view_team'
  | 'metrics.view_own'
  | 'metrics.export'
  | 'audit.view'
  | 'audit.review'
  | 'alerts.view'
  | 'alerts.manage'
  | 'copilot.manager'
  | 'revenue.view'
  | 'revenue.run'
  | 'playbooks.view'
  | 'playbooks.manage'
  | 'roi.view'
  | 'settings.company'
  | 'settings.users'
  | 'settings.teams';

interface UsePermissionsReturn {
  role: AppRole | null;
  isLoading: boolean;
  can: (permission: Permission) => boolean;
  canAny: (permissions: Permission[]) => boolean;
  canAll: (permissions: Permission[]) => boolean;
  isRole: (roles: AppRole | AppRole[]) => boolean;
  isAtLeast: (minRole: AppRole) => boolean;
}

const DEFAULT_PERMISSIONS: Record<AppRole, Record<string, boolean>> = {
  owner_admin: {
    'dashboard.view': true,
    'agents.view_all': true,
    'agents.view_team': true,
    'agents.view_own': true,
    'conversations.view_all': true,
    'conversations.view_team': true,
    'conversations.view_own': true,
    'metrics.view_all': true,
    'metrics.view_team': true,
    'metrics.view_own': true,
    'metrics.export': true,
    'audit.view': true,
    'audit.review': true,
    'alerts.view': true,
    'alerts.manage': true,
    'copilot.manager': true,
    'revenue.view': true,
    'revenue.run': true,
    'playbooks.view': true,
    'playbooks.manage': true,
    'roi.view': true,
    'settings.company': true,
    'settings.users': true,
    'settings.teams': true,
  },
  agent: {
    'dashboard.view': true,
    'agents.view_all': false,
    'agents.view_team': false,
    'agents.view_own': true,
    'conversations.view_all': false,
    'conversations.view_team': false,
    'conversations.view_own': true,
    'metrics.view_all': false,
    'metrics.view_team': false,
    'metrics.view_own': true,
    'metrics.export': false,
    'audit.view': false,
    'audit.review': false,
    'alerts.view': true,
    'alerts.manage': false,
    'copilot.manager': false,
    'revenue.view': false,
    'revenue.run': false,
    'playbooks.view': true,
    'playbooks.manage': false,
    'roi.view': false,
    'settings.company': false,
    'settings.users': false,
    'settings.teams': false,
  },
};

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
