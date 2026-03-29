import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Brain,
  BookCheck,
  CheckCircle2,
  Circle,
  HandCoins,
  MessageSquare,
  Rocket,
  Users,
  X,
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

const STORAGE_OPEN_KEY = 'setup-checklist-open';
const STORAGE_DISMISSED_KEY = 'setup-checklist-dismissed';

const STEPS: ChecklistStep[] = [
  {
    id: 'whatsapp',
    icon: MessageSquare,
    title: 'Conectar WhatsApp',
    description: 'Configure o webhook do seu WhatsApp para comecar a receber conversas.',
    linkTo: '/settings',
    linkLabel: 'Ir para Integracoes',
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
    title: 'Executar analise IA',
    description: 'Rode a analise de qualidade nas conversas para ver os scores do time.',
    linkTo: '/ai-insights',
    linkLabel: 'Ir para Analise IA',
  },
  {
    id: 'sale',
    icon: HandCoins,
    title: 'Registrar primeira venda',
    description: 'Comece a acompanhar a receita da operacao.',
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
  const [open, setOpen] = useState(() => localStorage.getItem(STORAGE_OPEN_KEY) !== '0');
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(STORAGE_DISMISSED_KEY) === '1');
  const { data: status, isLoading } = useSetupStatus(companyId);

  const completedCount = status ? Object.values(status).filter(Boolean).length : 0;
  const totalCount = STEPS.length;
  const allDone = completedCount === totalCount;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const nextStep = useMemo(() => {
    if (!status) return STEPS[0];
    return STEPS.find((step) => !status[step.id as keyof typeof status]) ?? null;
  }, [status]);

  const toggleOpen = () => {
    setOpen((current) => {
      const next = !current;
      localStorage.setItem(STORAGE_OPEN_KEY, next ? '1' : '0');
      return next;
    });
  };

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_DISMISSED_KEY, '1');
    setDismissed(true);
  };

  if (dismissed || allDone) return null;

  return (
    <div className="pointer-events-none fixed bottom-24 right-6 z-40 flex flex-col items-end gap-4 md:bottom-28">
      {open && (
        <div className="pointer-events-auto w-[min(92vw,380px)] overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)] backdrop-blur">
          <div className="flex items-start gap-3 px-5 pb-4 pt-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-secondary">
              <Rocket className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-slate-900">Primeiros passos</p>
              <p className="text-sm text-slate-500">
                {isLoading ? 'Verificando progresso...' : `${completedCount}/${totalCount} concluidos`}
              </p>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              aria-label="Fechar checklist"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-5 pb-4">
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="max-h-[60vh] space-y-1 overflow-y-auto px-4 pb-5">
            {STEPS.map((step) => {
              const done = status?.[step.id as keyof typeof status] ?? false;
              const isNext = !done && nextStep?.id === step.id;
              const Icon = step.icon;

              return (
                <div key={step.id} className="relative pl-10">
                  <div className="absolute left-[15px] top-8 h-full w-px bg-border last:hidden" />
                  <div className="absolute left-0 top-4">
                    {done ? (
                      <CheckCircle2 className="h-7 w-7 rounded-full bg-white text-primary" />
                    ) : (
                      <Circle className={cn('h-7 w-7 rounded-full bg-white', isNext ? 'text-secondary' : 'text-slate-300')} />
                    )}
                  </div>

                  <div
                    className={cn(
                      'rounded-2xl px-4 py-3 transition-all',
                      done && 'opacity-70',
                      isNext && 'border border-secondary/15 bg-accent shadow-sm',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                          done ? 'bg-primary/15 text-foreground' : isNext ? 'border border-secondary/12 bg-white text-secondary' : 'bg-slate-100 text-slate-500',
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            'text-sm font-semibold',
                            done ? 'text-foreground line-through' : 'text-slate-900',
                          )}
                        >
                          {step.title}
                        </p>

                        {!done && (
                          <p className="mt-1 text-sm leading-snug text-slate-500">
                            {step.description}
                          </p>
                        )}

                        {!done && isNext && (
                          <div className="mt-3">
                            <Link
                              to={step.linkTo}
                              className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02] hover:bg-primary/90"
                            >
                              Comecar
                            </Link>
                          </div>
                        )}

                        {!done && !isNext && (
                          <Link
                            to={step.linkTo}
                            className="mt-2 inline-flex text-xs font-semibold text-secondary transition-colors hover:text-secondary/85"
                          >
                            {step.linkLabel} →
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={toggleOpen}
        className="pointer-events-auto relative inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_18px_40px_rgba(220,254,27,0.32)] transition-transform hover:scale-105 hover:bg-primary/90"
        aria-label={open ? 'Recolher primeiros passos' : 'Abrir primeiros passos'}
      >
        <Rocket className="h-6 w-6" />
        <span className="absolute -right-0.5 -top-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-secondary px-1 text-[11px] font-bold text-white">
          {Math.max(totalCount - completedCount, 0)}
        </span>
      </button>
    </div>
  );
}
