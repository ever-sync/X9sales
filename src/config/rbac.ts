export const APP_ROLES = ['owner_admin', 'agent'] as const;

export type AppRole = (typeof APP_ROLES)[number];

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
  | 'revenue.view_own'
  | 'revenue.run'
  | 'revenue.run_own'
  | 'performance.view'
  | 'performance.view_all'
  | 'playbooks.view'
  | 'playbooks.manage'
  | 'roi.view'
  | 'settings.company'
  | 'settings.users'
  | 'settings.teams';

export const ROLE_LEVELS: Record<AppRole, number> = {
  owner_admin: 90,
  agent: 30,
};

export const ROLE_LABELS: Record<AppRole, string> = {
  owner_admin: 'Administrador',
  agent: 'Visualizador',
};

export const ROLE_BADGE_LABELS: Record<AppRole, string> = {
  owner_admin: 'ADMIN',
  agent: 'VISUALIZADOR',
};

export const DEFAULT_PERMISSIONS: Record<AppRole, Record<Permission, boolean>> = {
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
    'revenue.view_own': true,
    'revenue.run': true,
    'revenue.run_own': true,
    'performance.view': true,
    'performance.view_all': true,
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
    'conversations.view_own': false,
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
    'revenue.view_own': true,
    'revenue.run': false,
    'revenue.run_own': true,
    'performance.view': true,
    'performance.view_all': false,
    'playbooks.view': true,
    'playbooks.manage': false,
    'roi.view': false,
    'settings.company': false,
    'settings.users': false,
    'settings.teams': false,
  },
};

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === 'string' && APP_ROLES.includes(value as AppRole);
}

export function getRoleLabel(role: AppRole): string {
  return ROLE_LABELS[role];
}

export function getRoleBadgeLabel(role: AppRole): string {
  return ROLE_BADGE_LABELS[role];
}
