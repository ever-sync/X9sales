export const BROWSER_ALERTS_STORAGE_KEY = 'x9sales-critical-alerts-enabled';

export function areBrowserAlertsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(BROWSER_ALERTS_STORAGE_KEY) === 'true';
}

export function setBrowserAlertsEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(BROWSER_ALERTS_STORAGE_KEY, enabled ? 'true' : 'false');
}

export async function requestBrowserAlertPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported' as const;
  }

  const permission = await Notification.requestPermission();
  if (permission === 'granted') setBrowserAlertsEnabled(true);
  return permission;
}
