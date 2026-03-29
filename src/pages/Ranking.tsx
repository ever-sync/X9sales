import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCompany } from '../contexts/CompanyContext';
import { supabase } from '../integrations/supabase/client';
import { cn } from '../lib/utils';
import { downloadCsv } from '../lib/export';
import type { AgentRanking } from '../types';
import {
  Trophy,
  Medal,
  Star,
  HandCoins,
  Activity
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { EmptyState } from '../components/ui/EmptyState';

// ── hook ──────────────────────────────────────────────────────────────────────

function useRanking() {
  const { companyId } = useCompany();
  return useQuery<AgentRanking[]>({
    queryKey: ['agent-ranking', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('mv_agent_ranking')
        .select('*')
        .eq('company_id', companyId);
      if (error) throw error;
      return (data ?? []) as AgentRanking[];
    },
    enabled: !!companyId,
    staleTime: 1000 * 60 * 5,
  });
}

// ── helpers ───────────────────────────────────────────────────────────────────

function qualityColor(score: number | null) {
  if (score == null) return 'text-muted-foreground';
  if (score >= 80) return 'text-emerald-500 font-bold';
  if (score >= 60) return 'text-amber-500 font-bold';
  return 'text-red-500 font-bold';
}

function fmtRevenue(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function AgentInitials({ name }: { name: string }) {
  const parts = name.trim().split(' ');
  const initials = parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`
    : name.slice(0, 2);
  return <span className="text-sm font-black text-black uppercase">{initials}</span>;
}

const PODIUM = [
  { rank: 1, icon: <Trophy className="h-6 w-6 text-yellow-400" />, border: 'border-yellow-400', bg: 'bg-yellow-400/10', label: '1º Lugar' },
  { rank: 2, icon: <Medal className="h-6 w-6 text-slate-300" />, border: 'border-slate-300', bg: 'bg-slate-300/10', label: '2º Lugar' },
  { rank: 3, icon: <Medal className="h-6 w-6 text-orange-400" />, border: 'border-orange-400', bg: 'bg-orange-400/10', label: '3º Lugar' },
];

// ── Ranking Page ──────────────────────────────────────────────────────────────

export default function Ranking() {
  const { data, isLoading } = useRanking();
  const agents = data ?? [];

  const salesRanking = useMemo(() => {
    return [...agents].sort((a, b) => b.total_revenue - a.total_revenue);
  }, [agents]);

  const serviceRanking = useMemo(() => {
    return [...agents].sort((a, b) => (b.avg_ai_quality_score ?? 0) - (a.avg_ai_quality_score ?? 0));
  }, [agents]);

  if (isLoading) {
    return <div className="p-8 animate-pulse space-y-4">
      <div className="h-10 w-48 bg-slate-200 dark:bg-slate-800 rounded-lg" />
      <div className="grid grid-cols-3 gap-4">
        <div className="h-48 bg-slate-100 dark:bg-slate-800/50 rounded-3xl" />
        <div className="h-48 bg-slate-100 dark:bg-slate-800/50 rounded-3xl" />
        <div className="h-48 bg-slate-100 dark:bg-slate-800/50 rounded-3xl" />
      </div>
    </div>;
  }

  if (agents.length === 0) {
    return (
      <div className="flex-1 p-4 md:p-8 pt-6">
        <div className="flex flex-col gap-2 mb-8">
          <h2 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <Trophy className="text-yellow-400 h-10 w-10 shrink-0" />
            Copa de Performance
          </h2>
        </div>
        <EmptyState
          icon={Trophy}
          title="Nenhum dado de ranking ainda"
          description="O ranking será exibido após os atendentes registrarem conversas e vendas. Os dados são atualizados a cada 5 minutos."
        />
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-8 p-4 md:p-8 pt-6 pb-32">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
           <Trophy className="text-yellow-400 h-10 w-10 shrink-0" />
           Copa de Performance
        </h2>
        <p className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest text-xs">
          Onde os melhores se destacam • Dados atualizados em tempo real
        </p>
        <button
          type="button"
          onClick={() => {
            downloadCsv('ranking-agentes.csv', agents.map((agent) => ({
              agente: agent.agent_name,
              conversas: agent.total_conversations,
              qualidade_ia: agent.avg_ai_quality_score,
              sla_primeira_resposta: agent.avg_sla_first_response_pct,
              deals_ganhos: agent.total_deals_won,
              receita_total: agent.total_revenue,
              csat_previsto: agent.avg_predicted_csat,
            })));
          }}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Exportar CSV
        </button>
      </div>

      <Tabs defaultValue="sales" className="w-full">
        <TabsList className="bg-slate-100 dark:bg-slate-900 p-1 rounded-2xl border border-slate-200 dark:border-slate-800 mb-8 h-14">
          <TabsTrigger 
            value="sales" 
            className="rounded-xl px-8 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-black data-[state=active]:shadow-lg font-black uppercase text-xs tracking-widest transition-all"
          >
            <HandCoins className="mr-2 h-4 w-4" /> Ranking de Vendas
          </TabsTrigger>
          <TabsTrigger 
            value="service" 
            className="rounded-xl px-8 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-black data-[state=active]:shadow-lg font-black uppercase text-xs tracking-widest transition-all"
          >
            <Activity className="mr-2 h-4 w-4" /> Ranking de Atendimento
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
          {/* Podium Vendas */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
            {[salesRanking[1], salesRanking[0], salesRanking[2]].map((agent, i) => {
              if (!agent) return null;
              const rank = [2, 1, 3][i];
              const p = PODIUM.find(x => x.rank === rank)!;
              return (
                <div 
                  key={agent.agent_id} 
                  className={cn(
                    "relative flex flex-col items-center p-6 rounded-[2.5rem] border-2 transition-all hover:scale-105",
                    p.border, p.bg,
                    rank === 1 ? "pb-12 border-b-8 order-1 md:order-2" : rank === 2 ? "order-2 md:order-1" : "order-3"
                  )}
                >
                  <div className="absolute -top-4 w-10 h-10 rounded-full bg-white dark:bg-slate-900 border-2 border-inherit flex items-center justify-center shadow-lg">
                    {p.icon}
                  </div>
                  <div className="h-20 w-20 rounded-full bg-primary flex items-center justify-center mb-4 shadow-xl ring-4 ring-white/20">
                     <AgentInitials name={agent.agent_name} />
                  </div>
                  <h3 className="font-black text-lg text-slate-900 dark:text-white text-center leading-tight">{agent.agent_name}</h3>
                  <div className="mt-4 text-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Receita Total</p>
                    <p className="text-2xl font-black text-primary-foreground">{fmtRevenue(agent.total_revenue)}</p>
                  </div>
                  <div className="mt-2 flex gap-4">
                     <div className="text-center">
                        <p className="text-[8px] font-black uppercase text-slate-500">Vendas</p>
                        <p className="text-xs font-black">{agent.total_deals_won}</p>
                     </div>
                     <div className="text-center">
                        <p className="text-[8px] font-black uppercase text-slate-500">Conv.</p>
                        <p className="text-xs font-black">{Math.round((agent.total_deals_won / agent.total_conversations) * 100)}%</p>
                     </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tabela Vendas */}
          <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xl">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
               <h4 className="font-black uppercase tracking-tighter text-lg">Classificação de Vendas</h4>
               <span className="text-[10px] font-black bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full text-slate-500 italic">Ordenado por faturamento</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-6 py-4 text-left w-16">Rank</th>
                    <th className="px-6 py-4 text-left">Vendedor</th>
                    <th className="px-6 py-4 text-center">Negócios</th>
                    <th className="px-6 py-4 text-center">Ticket Médio</th>
                    <th className="px-6 py-4 text-center">Conversão</th>
                    <th className="px-6 py-4 text-right">Faturamento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                   {salesRanking.map((agent, i) => (
                     <tr key={agent.agent_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                        <td className="px-6 py-5">
                           <span className={cn(
                             "w-8 h-8 rounded-full flex items-center justify-center font-black text-sm transition-all group-hover:scale-110",
                             i === 0 ? "bg-yellow-400 text-black border-2 border-yellow-500 shadow-lg shadow-yellow-400/20" :
                             i === 1 ? "bg-slate-200 text-slate-700" :
                             i === 2 ? "bg-orange-200 text-orange-700" :
                             "text-slate-400"
                           )}>
                              {i + 1}
                           </span>
                        </td>
                        <td className="px-6 py-5">
                           <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold">
                                 {agent.agent_name[0]}
                              </div>
                              <div>
                                 <p className="font-black text-slate-900 dark:text-white leading-none">{agent.agent_name}</p>
                                 <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">Top Seller</p>
                              </div>
                           </div>
                        </td>
                        <td className="px-6 py-5 text-center">
                           <p className="font-black text-slate-700 dark:text-slate-300">{agent.total_deals_won}</p>
                           <p className="text-[9px] font-bold text-slate-400 uppercase">Ganhos</p>
                        </td>
                        <td className="px-6 py-5 text-center">
                           <p className="font-black text-slate-700 dark:text-slate-300">
                              {agent.total_deals_won > 0 ? fmtRevenue(Math.round(agent.total_revenue / agent.total_deals_won)) : 'R$ 0'}
                           </p>
                        </td>
                        <td className="px-6 py-5 text-center">
                           <div className="flex flex-col items-center gap-1">
                              <span className="font-black text-emerald-500">{Math.round((agent.total_deals_won / agent.total_conversations) * 100)}%</span>
                              <div className="w-12 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                 <div className="h-full bg-emerald-500" style={{ width: `${(agent.total_deals_won / agent.total_conversations) * 100}%` }} />
                              </div>
                           </div>
                        </td>
                        <td className="px-6 py-5 text-right">
                           <span className="font-black text-lg text-primary-foreground tracking-tighter">
                              {fmtRevenue(agent.total_revenue)}
                           </span>
                        </td>
                     </tr>
                   ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="service" className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
           {/* Podium Atendimento */}
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
            {[serviceRanking[1], serviceRanking[0], serviceRanking[2]].map((agent, i) => {
              if (!agent) return null;
              const rank = [2, 1, 3][i];
              const p = PODIUM.find(x => x.rank === rank)!;
              return (
                <div 
                  key={agent.agent_id} 
                  className={cn(
                    "relative flex flex-col items-center p-6 rounded-[2.5rem] border-2 transition-all hover:scale-105",
                    p.border, p.bg,
                    rank === 1 ? "pb-12 border-b-8 order-1 md:order-2" : rank === 2 ? "order-2 md:order-1" : "order-3"
                  )}
                >
                  <div className="absolute -top-4 w-10 h-10 rounded-full bg-white dark:bg-slate-900 border-2 border-inherit flex items-center justify-center shadow-lg">
                    <Star className="h-6 w-6 text-primary filled" />
                  </div>
                  <div className="h-20 w-20 rounded-full bg-primary flex items-center justify-center mb-4 shadow-xl ring-4 ring-white/20 group">
                     <AgentInitials name={agent.agent_name} />
                  </div>
                  <h3 className="font-black text-lg text-slate-900 dark:text-white text-center leading-tight">{agent.agent_name}</h3>
                  <div className="mt-4 text-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Qualidade IA</p>
                    <p className="text-4xl font-black text-primary-foreground">{agent.avg_ai_quality_score}/100</p>
                  </div>
                  <div className="mt-2 flex gap-4">
                     <div className="text-center">
                        <p className="text-[8px] font-black uppercase text-slate-500">CSAT</p>
                        <p className="text-xs font-black">{agent.avg_predicted_csat?.toFixed(1)} ★</p>
                     </div>
                     <div className="text-center">
                        <p className="text-[8px] font-black uppercase text-slate-500">SLA</p>
                        <p className="text-xs font-black">{agent.avg_sla_first_response_pct}%</p>
                     </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tabela Atendimento */}
          <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xl">
             <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
               <h4 className="font-black uppercase tracking-tighter text-lg">Mestres do Atendimento</h4>
               <span className="text-[10px] font-black bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full text-slate-500 italic">Ordenado por qualidade técnica</span>
            </div>
            <div className="overflow-x-auto">
               <table className="w-full">
                  <thead>
                     <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800">
                        <th className="px-6 py-4 text-left w-16">Rank</th>
                        <th className="px-6 py-4 text-left">Atendente</th>
                        <th className="px-6 py-4 text-center">Tempo Resposta</th>
                        <th className="px-6 py-4 text-center">SLA 1ª Resp.</th>
                        <th className="px-6 py-4 text-center">CSAT Médio</th>
                        <th className="px-6 py-4 text-right">Nota IA</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                     {serviceRanking.map((agent, i) => (
                        <tr key={agent.agent_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                           <td className="px-6 py-5">
                              <span className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center font-black text-sm",
                                i === 0 ? "bg-primary text-black" : "text-slate-400"
                              )}>
                                 {i + 1}
                              </span>
                           </td>
                           <td className="px-6 py-5 font-black text-slate-900 dark:text-white">
                              {agent.agent_name}
                           </td>
                           <td className="px-6 py-5 text-center">
                              <p className="font-black text-slate-700 dark:text-slate-300">
                                 {Math.round((agent.avg_first_response_sec ?? 0) / 60)} min
                              </p>
                           </td>
                           <td className="px-6 py-5 text-center">
                              <span className={cn(
                                "font-black",
                                (agent.avg_sla_first_response_pct ?? 0) >= 90 ? "text-emerald-500" :
                                (agent.avg_sla_first_response_pct ?? 0) >= 70 ? "text-amber-500" : "text-red-500"
                              )}>
                                 {agent.avg_sla_first_response_pct ?? 0}%
                              </span>
                           </td>
                           <td className="px-6 py-5 text-center">
                              <div className="flex items-center justify-center gap-1">
                                 <span className="font-black">{agent.avg_predicted_csat?.toFixed(1)}</span>
                                 <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                              </div>
                           </td>
                           <td className="px-6 py-5 text-right">
                              <div className="inline-flex items-center gap-2">
                                 <div className="flex flex-col items-end">
                                    <span className={cn("text-xl font-black tracking-tighter", qualityColor(agent.avg_ai_quality_score))}>
                                       {agent.avg_ai_quality_score}
                                    </span>
                                 </div>
                              </div>
                           </td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
