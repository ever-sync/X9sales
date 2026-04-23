export { APP_ROLES as ROLES, ROLE_LEVELS } from './rbac';

export const CHANNELS = {
  WHATSAPP: 'whatsapp',
  EMAIL: 'email',
  CALL: 'call',
  CHAT: 'chat',
  INSTAGRAM: 'instagram',
} as const;

export const EVENT_TYPES = {
  FIRST_RESPONSE: 'FIRST_RESPONSE',
  FOLLOWUP: 'FOLLOWUP',
  PROPOSAL_SENT: 'PROPOSAL_SENT',
  WON: 'WON',
  LOST: 'LOST',
  HANDOFF: 'HANDOFF',
  SLA_BREACH: 'SLA_BREACH',
} as const;

export const ALERT_TYPES = {
  SLA_BREACH: 'SLA_BREACH',
  NO_RESPONSE: 'NO_RESPONSE',
  HIGH_VALUE_LOST: 'HIGH_VALUE_LOST',
  INACTIVITY: 'INACTIVITY',
} as const;

export const SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;

export const CACHE = {
  STALE_TIME: 5 * 60 * 1000, // 5 min
  GC_TIME: 10 * 60 * 1000, // 10 min
} as const;

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;
