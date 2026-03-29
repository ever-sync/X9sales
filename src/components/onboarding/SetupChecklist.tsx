import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  Rocket,
  MessageSquare,
  Users,
  BookCheck,
  Brain,
  HandCoins,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from '../../integrations/supabase/client';
import { useCompany } from '../../contexts/CompanyContext';

interface ChecklistStep {
  id: string;
  icon: React.ElementType;
  title: string;
  description: string;
  linkTo: string;
  linkLabel: string;
}

const STEPS: ChecklistStep[] = [
  {
    id: 'whatsapp',
    icon: MessageSquare,
    title: 'Conectar WhatsApp',
    description: 'Configure o webhook do seu WhatsApp para começar a receber conversas.',
    linkTo: '/settings',
    linkLabel: 'Ir para Integrações',
  },
  {
    id: 'agent',
    icon: Users,
    title: 'Adicionar atendente',
    description: 'Cadastre os membros da sua equipe de vendas.',
    linkTo: '/agents',
    linkLabel: 'Ver Atendentes',
  },
  {
    id: 'playbook',
    icon: BookCheck,
    title: 'Criar um playbook',
    description: 'Defina o script ideal de abordagem para guiar sua equipe.',
    linkTo: '/playbooks',
    linkLabel: 'Criar Playbook',
  },
  {
    id: 'ai_analysis',
    icon: Brain,
    title: 'Executar análise IA',
    description: 'Rode a análise de qualidade nas conversas para ver os scores do time.',
    linkTo: '/ai-insights',
    linkLabel: 'Ir para Análise IA',
  },
  {
    id: 'sale',
    icon: HandCoins,
    title: 'Registrar primeira venda',
    description: 'Comece a acompanhar a receita da operação.',
    linkTo: '/sales',
    linkLabel: 'Registrar Venda',
  },
];

function useSetupStatus(companyId: string | null) {
  return useQuery({
    queryKey: ['setup-status', companyId],
    queryFn: async () => {
      if (!companyId) return { whatsapp: false, agent: false, playbook: false, ai_analysis: false, sale: false };

      const [conversations, agents, playbooks, analyses, sales] = await Promise.all([
        supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
        supabase.from('agents').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('is_active', true),
        supabase.from('playbooks').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
        supabase.from('ai_analyses').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
        supabase.from('sales_records').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
      ]);

      return {
        whatsapp: (conversations.count ?? 0) > 0,
        agent: (agents.count ?? 0) > 0,
        playbook: (playbooks.count ?? 0) > 0,
        ai_analysis: (analyses.count ?? 0) > 0,
        sale: (sales.count ?? 0) > 0,
      };
    },
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });
}

export function SetupChecklist() {
  const { companyId } = useCompany();
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem('setup-checklist-dismissed') === '1';
  });

  const { data: status, isLoading } = useSetupStatus(companyId);

  if (dismissed) return null;

  const completedCount = status
    ? Object.values(status).filter(Boolean).length
    : 0;
  const totalCount = STEPS.length;
  const allDone = completedCount === totalCount;

  const handleDismiss = () => {
    localStorage.setItem('setup-checklist-dismissed', '1');
    setDismissed(true);
  };

  if (allDone) return null;

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 overflow-hidden">
      {/* header */}
      <div className="flex items-center gap-3 px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15">
          <Rocket className="h-4.5 w-4.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Primeiros passos</p>
          <p className="text-xs text-muted-foreground">
            {isLoading ? 'Verificando...' : `${completedCount} de ${totalCount} concluídos`}
          </p>
        </div>

        {/* progress bar */}
        <div className="hidden sm:flex items-center gap-2 mr-2">
          <div className="w-24 h-1.5 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${(completedCount / totalCount) * 100}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-primary">{Math.round((completedCount / totalCount) * 100)}%</span>
        </div>

        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label={collapsed ? 'Expandir checklist' : 'Recolher checklist'}
        >
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>

        <button
          type="button"
          onClick={handleDismiss}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-1"
        >
          Fechar
        </button>
      </div>

      {/* steps */}
      {!collapsed && (
        <div className="border-t border-primary/10 divide-y divide-primary/10">
          {STEPS.map(step => {
            const done = status?.[step.id as keyof typeof status] ?? false;
            const Icon = step.icon;
            return (
              <div
                key={step.id}
                className={cn(
                  'flex items-center gap-4 px-5 py-3.5 transition-colors',
                  done ? 'opacity-60' : 'hover:bg-primary/5',
                )}
              >
                {/* status icon */}
                {done
                  ? <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                  : <Circle className="h-5 w-5 text-white/20 shrink-0" />
                }

                {/* step icon */}
                <div className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg shrink-0',
                  done ? 'bg-primary/10' : 'bg-white/5',
                )}>
                  <Icon className={cn('h-4 w-4', done ? 'text-primary' : 'text-white/50')} />
                </div>

                {/* text */}
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    'text-sm font-medium',
                    done ? 'line-through text-muted-foreground' : 'text-foreground',
                  )}>
                    {step.title}
                  </p>
                  {!done && (
                    <p className="text-xs text-muted-foreground truncate">{step.description}</p>
                  )}
                </div>

                {/* link */}
                {!done && (
                  <Link
                    to={step.linkTo}
                    className="text-xs font-semibold text-primary hover:underline shrink-0"
                  >
                    {step.linkLabel} →
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
