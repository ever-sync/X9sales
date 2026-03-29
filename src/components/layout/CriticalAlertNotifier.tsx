import { useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '../../integrations/supabase/client';
import { useCompany } from '../../contexts/CompanyContext';
import { areBrowserAlertsEnabled } from '../../lib/browserNotifications';
import { env } from '../../config/env';

interface AlertRealtimeRow {
  id: string;
  company_id: string;
  alert_type: string;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  agent_id: string | null;
}

export function CriticalAlertNotifier() {
  const { companyId, role } = useCompany();

  useEffect(() => {
    if (!companyId || role !== 'owner_admin') return;

    const channel = supabase
      .channel(`critical-alerts:${companyId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'alerts',
          filter: `company_id=eq.${companyId}`,
        },
        async (payload) => {
          const alert = payload.new as AlertRealtimeRow;
          if (alert.severity !== 'critical') return;

          toast.error(alert.title || 'Novo alerta critico detectado.', {
            description: alert.description ?? 'Abra a central de alertas para agir rapidamente.',
            action: {
              label: 'Ver alertas',
              onClick: () => {
                window.location.href = '/alerts';
              },
            },
          });

          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted' && areBrowserAlertsEnabled()) {
            const notification = new Notification(alert.title || 'Alerta critico', {
              body: alert.description ?? 'A plataforma detectou uma ocorrencia critica que requer acao.',
              tag: alert.id,
            });
            notification.onclick = () => {
              window.focus();
              window.location.href = '/alerts';
            };
          }

          try {
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData.session?.access_token;
            if (!token) return;

            await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/send-push-alert`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: env.VITE_SUPABASE_ANON_KEY,
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                type: 'INSERT',
                record: alert,
              }),
            });
          } catch {
            // Silent fail: browser toast/notification already surfaced the alert locally.
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, role]);

  return null;
}
