import { useCompany } from '../contexts/CompanyContext';
import { formatSeconds } from '../lib/utils';
import { Settings as SettingsIcon, ShieldAlert } from 'lucide-react';
import { Switch } from '../components/ui/switch';
import { supabase } from '../integrations/supabase/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export default function Settings() {
  const { company } = useCompany();
  const queryClient = useQueryClient();

  const updateSettingsMutation = useMutation({
    mutationFn: async (autoBlock: boolean) => {
      if (!company) return;
      
      const newSettings = {
        ...company.settings,
        auto_block_on_critical_risk: autoBlock
      };

      const { error } = await supabase
        .from('companies' as any)
        .update({ settings: newSettings })
        .eq('id', company.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-company'] });
      toast.success('Configurações atualizadas');
    },
    onError: (err) => {
      toast.error('Erro ao atualizar: ' + err.message);
    }
  });

  if (!company) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Carregando...
      </div>
    );
  }

  const settings = company.settings;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Configuracoes</h2>
        <p className="text-muted-foreground mt-1">Configuracoes da empresa e metas de SLA</p>
      </div>

      <div className="bg-card rounded-2xl border border-border p-6 space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-border">
          <SettingsIcon className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">{company.name}</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              SLA Primeira Resposta
            </label>
            <p className="text-lg font-semibold text-foreground">
              {formatSeconds(settings.sla_first_response_sec)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Meta de tempo para a primeira resposta do atendente
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              SLA Resolucao
            </label>
            <p className="text-lg font-semibold text-foreground">
              {formatSeconds(settings.sla_resolution_sec)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Meta de tempo para resolucao completa da conversa
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Fuso Horario
            </label>
            <p className="text-lg font-semibold text-foreground">{settings.timezone}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Horario Comercial
            </label>
            <p className="text-lg font-semibold text-foreground">
              {settings.working_hours_start} — {settings.working_hours_end}
            </p>
          </div>
        </div>

        <div className="pt-6 border-t border-border">
           <div className="flex items-center justify-between p-4 bg-red-50 rounded-xl border border-red-100">
              <div className="flex gap-4">
                 <ShieldAlert className="h-6 w-6 text-red-600 shrink-0" />
                 <div>
                    <h4 className="font-bold text-red-900 leading-none mb-1">Bloqueio Automático de Segurança</h4>
                    <p className="text-sm text-red-700 max-w-md">
                       Interrompe a sessão do atendente instantaneamente se a IA detectar risco crítico de SPAM ou comportamento anômalo.
                    </p>
                 </div>
              </div>
              <Switch 
                checked={!!settings.auto_block_on_critical_risk}
                onChange={(e) => updateSettingsMutation.mutate(e.target.checked)}
                disabled={updateSettingsMutation.isPending}
              />
           </div>
        </div>

        <p className="text-xs text-muted-foreground pt-4 border-t border-border">
          Para alterar outras configurações básicas, entre em contato com o suporte.
        </p>
      </div>
    </div>
  );
}
