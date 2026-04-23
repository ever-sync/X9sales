import { describe, expect, it } from 'vitest';
import {
  APP_ROLES,
  DEFAULT_PERMISSIONS,
  getRoleBadgeLabel,
  getRoleLabel,
  isAppRole,
} from './rbac';

describe('rbac', () => {
  it('accepts only supported roles', () => {
    expect(isAppRole('owner_admin')).toBe(true);
    expect(isAppRole('agent')).toBe(true);
    expect(isAppRole('manager')).toBe(false);
    expect(isAppRole(null)).toBe(false);
  });

  it('keeps role metadata aligned with the supported roles list', () => {
    expect(APP_ROLES).toEqual(['owner_admin', 'agent']);
    expect(getRoleLabel('owner_admin')).toBe('Administrador');
    expect(getRoleBadgeLabel('agent')).toBe('VISUALIZADOR');
  });

  it('grants management permissions only to owner_admin', () => {
    expect(DEFAULT_PERMISSIONS.owner_admin['settings.company']).toBe(true);
    expect(DEFAULT_PERMISSIONS.owner_admin['playbooks.manage']).toBe(true);
    expect(DEFAULT_PERMISSIONS.agent['settings.company']).toBe(false);
    expect(DEFAULT_PERMISSIONS.agent['playbooks.manage']).toBe(false);
  });
});
