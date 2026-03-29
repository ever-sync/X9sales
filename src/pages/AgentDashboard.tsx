import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Clock,
  CheckCircle2,
  ShieldAlert,
  Target,
  TrendingUp,
  MessageSquare,
  UserPlus,
  PlayCircle,
  AlertCircle,
  Zap,
  ChevronRight,
  ArrowUpRight,
  Trophy,
  BrainCircuit,
  ListTodo
} from 'lucide-react';
import { useCompany } from '../contexts/CompanyContext';
import { supabase } from '../integrations/supabase/client';
import { CACHE } from '../config/constants';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';

export default function AgentDashboard() {
  const { company } = useCompany();
  const { user } = useAuth();
  
  // Perfil do Agente
  const { data: myAgent } = useQuery({
    queryKey: ['my-agent-profile', company?.id, user?.id],
    queryFn: async () => {
      if (!company?.id || !user?.id || !user.email) return null;
      const { data } = await supabase
        .from('agents')
        .select('*')
        .eq('company_id', company.id)
        .eq('email', user.email)
        .maybeSingle();
      return data;
    },
    enabled: !!company?.id && !!user?.id,
  });

  const agentId = myAgent?.id;

  // Mock de dados para a visão "Inteligente" solicitada
  const todayMetrics = {
    leadsReceived: 12,
    started: 8,
    inProgress: 15,
    noResponse: 4,
    followUps: 6,
    advances: 3,
    closures: 1,
    responseRate: '92%'
  };

  const goals = [
    { label: 'Contatos', current: 18, target: 30, color: 'bg-blue-500' },
    { label: 'Avanços', current: 6, target: 10, color: 'bg-indigo-500' },
    { label: 'Fechamentos', current: 1, target: 3, color: 'bg-emerald-500' },
  ];

  const funnelSteps = [
    { label: 'Recebidos', value: 45 },
    { label: 'Respondidos', value: 38 },
    { label: 'Qualificados', value: 24 },
    { label: 'Propostas', value: 12 },
    { label: 'Negociando', value: 8 },
    { label: 'Fechados', value: 3 },
  ];

  const intelligentAlerts = [
    { text: '4 leads sem resposta há mais de 30 min', type: 'error' },
    { text: '3 oportunidades precisam de follow-up hoje', type: 'warning' },
    { text: 'Sua taxa de fechamento caiu 12% nesta semana', type: 'info' },
  ];

  return (
    <div className="space-y-8 pb-32">
      {/* 1. Saudação + Resumo do Dia */}
      <div className="px-4 md:px-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground transition-all">
            Olá, {myAgent?.name?.split(' ')[0] ?? 'Vendedor'}! 🚀
          </h1>
          <p className="mt-1 text-sm text-muted-foreground font-semibold flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Operação ativa • {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/sales" className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-primary text-primary-foreground px-6 py-4 rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all text-sm uppercase tracking-wider">
            <Zap size={18} fill="currentColor" />
            Lançar Venda
          </Link>
        </div>
      </div>

      {/* Cards de Resumo Rápido (Operacional) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-4 md:px-0">
         {[
           { label: 'Recebidos', val: todayMetrics.leadsReceived, icon: UserPlus, color: 'text-blue-500', bg: 'bg-blue-50' },
           { label: 'Iniciados', val: todayMetrics.started, icon: MessageSquare, color: 'text-indigo-500', bg: 'bg-indigo-50' },
           { label: 'Sem Resposta', val: todayMetrics.noResponse, icon: Clock, color: 'text-red-500', bg: 'bg-red-50' },
           { label: 'Follow-ups', val: todayMetrics.followUps, icon: AlertCircle, color: 'text-amber-500', bg: 'bg-amber-50' },
         ].map((item, i) => (
           <div key={i} className="bg-card border border-slate-200/60 dark:border-slate-800/60 p-4 rounded-[1.5rem] shadow-sm">
             <div className={`${item.bg} dark:bg-white/5 w-10 h-10 rounded-xl flex items-center justify-center mb-3`}>
               <item.icon size={20} className={item.color} />
             </div>
             <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{item.label}</p>
             <h3 className="text-2xl font-black mt-1">{item.val}</h3>
           </div>
         ))}
      </div>

      {/* 2. Meta do Dia (Urgência) */}
      <section className="px-4 md:px-0">
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden">
           <div className="absolute top-0 right-0 p-8 opacity-10 rotate-12">
             <Target size={140} />
           </div>
           <div className="relative z-10">
              <h3 className="text-xl font-black mb-6 flex items-center gap-2">
                <Target className="text-primary" />
                METAS DE HOJE
              </h3>
              <div className="space-y-6">
                {goals.map((goal, i) => (
                  <div key={i}>
                    <div className="flex justify-between items-end mb-2">
                      <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">{goal.label}</span>
                      <span className="text-lg font-black">
                        {goal.current}<span className="text-slate-500 text-sm font-bold">/{goal.target}</span>
                      </span>
                    </div>
                    <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${goal.color} transition-all duration-1000 shadow-[0_0_10px_rgba(0,0,0,0.5)]`}
                        style={{ width: `${(goal.current / goal.target) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
           </div>
        </div>
      </section>

      {/* 3. Funil do Dia + 4. Alertas Inteligentes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-4 md:px-0">
        {/* Funil Visual */}
        <div className="bg-card border border-slate-200/60 p-6 rounded-[2.5rem] shadow-sm">
           <h3 className="text-lg font-black mb-6 uppercase tracking-tight">Onde as vendas estão?</h3>
           <div className="space-y-2">
             {funnelSteps.map((step, i) => {
               const maxWidth = 100 - (i * 10);
               return (
                 <div key={i} className="flex items-center gap-4">
                   <div className="w-24 text-right">
                     <span className="text-[10px] font-black uppercase text-muted-foreground">{step.label}</span>
                   </div>
                   <div className="flex-1 flex items-center">
                     <div 
                      className="h-8 bg-primary/10 border-l-4 border-primary rounded-r-lg flex items-center px-3"
                      style={{ width: `${maxWidth}%` }}
                     >
                       <span className="text-xs font-black text-primary">{step.value}</span>
                     </div>
                   </div>
                 </div>
               )
             })}
           </div>
        </div>

        {/* Alertas Inteligentes */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-[2.5rem] shadow-sm">
           <h3 className="text-lg font-black mb-6 uppercase tracking-tight flex items-center gap-2">
             <BrainCircuit className="text-indigo-500" />
             Alertas de Ação
           </h3>
           <div className="space-y-3">
             {intelligentAlerts.map((alert, i) => (
                <div key={i} className={`p-4 rounded-2xl border flex gap-3 items-start ${
                  alert.type === 'error' ? 'bg-red-50 border-red-100 dark:bg-red-900/10 dark:border-red-900/30 text-red-700 dark:text-red-400' :
                  alert.type === 'warning' ? 'bg-amber-50 border-amber-100 dark:bg-amber-900/10 dark:border-amber-900/30 text-amber-700 dark:text-amber-400' :
                  'bg-blue-50 border-blue-100 dark:bg-blue-900/10 dark:border-blue-900/30 text-blue-700 dark:text-blue-400'
                }`}>
                  <ShieldAlert size={18} className="shrink-0 mt-0.5" />
                  <p className="text-sm font-bold leading-tight">{alert.text}</p>
                </div>
             ))}
           </div>
        </div>
      </div>

      {/* 5. Missão do Dia (IA) */}
      <section className="px-4 md:px-0">
        <div className="bg-emerald-50 dark:bg-emerald-950/20 border-2 border-emerald-500/20 p-8 rounded-[2.5rem] relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Zap size={100} className="text-emerald-500" />
          </div>
          <div className="max-w-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-emerald-500 text-white p-2 rounded-xl">
                <BrainCircuit size={20} />
              </div>
              <h3 className="text-xl font-black text-emerald-900 dark:text-emerald-400 uppercase tracking-tight">Treinamento em Tempo Real</h3>
            </div>
            
            <div className="grid gap-6 md:grid-cols-2 mt-6">
               <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-1">Missão de hoje</h4>
                  <p className="text-lg font-bold text-slate-800 dark:text-slate-200">Fazer 2 perguntas antes de apresentar qualquer solução.</p>
               </div>
               <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-1">Dica Prática</h4>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Descubra a dor real do cliente antes de falar de preço. Isso aumenta sua percepção de valor.</p>
               </div>
               <div className="md:col-span-2 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-emerald-500/10">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-2 italic">Frase para usar agora:</h4>
                  <p className="text-base font-bold text-slate-900 dark:text-white">“Posso te passar o valor sim, mas antes me diz uma coisa: qual o seu maior desafio hoje com [problema]?”</p>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Próximas Ações */}
      <section className="px-4 md:px-0">
        <div className="bg-card border border-slate-200 p-6 rounded-[2.5rem] shadow-sm">
           <div className="flex items-center justify-between mb-6">
             <h3 className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
               <ListTodo className="text-primary" />
               O que fazer agora?
             </h3>
             <span className="text-xs font-black bg-slate-100 px-3 py-1 rounded-full uppercase">5 Pendentes</span>
           </div>
           
           <div className="space-y-3">
             {[
               { name: 'Ricardo Santos', action: 'Enviar Proposta', time: 'Há 15 min', urgent: true },
               { name: 'Beatriz Lima', action: 'Fazer Follow-up', time: 'Atrasado', urgent: true },
               { name: 'Carlos Oliveira', action: 'Retomar Conversa', time: 'Há 1h', urgent: false },
               { name: 'Loja ABC', action: 'Confirmar Reunião', time: 'Há 2h', urgent: false },
             ].map((task, i) => (
               <div key={i} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 group hover:border-primary transition-colors cursor-pointer">
                 <div className="flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center font-black ${task.urgent ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                      {task.name.charAt(0)}
                    </div>
                    <div>
                      <h4 className="text-sm font-black">{task.name}</h4>
                      <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">{task.action}</p>
                    </div>
                 </div>
                 <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-black uppercase ${task.urgent ? 'text-red-500' : 'text-slate-400'}`}>{task.time}</span>
                    <ChevronRight size={16} className="text-slate-300 group-hover:text-primary transition-colors" />
                 </div>
               </div>
             ))}
           </div>

           <Button variant="ghost" className="w-full mt-6 rounded-xl font-bold text-muted-foreground">Ver lista completa</Button>
        </div>
      </section>

      {/* 7. Ranking Pessoal + 8. Análise Rápida IA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-4 md:px-0">
        <div className="bg-card border border-slate-200 p-6 rounded-[2.5rem] shadow-sm relative overflow-hidden">
           <div className="absolute -bottom-6 -right-6 opacity-5 rotate-12">
             <Trophy size={160} />
           </div>
           <h3 className="text-lg font-black mb-6 uppercase tracking-tight flex items-center gap-2">
             <Trophy className="text-amber-500" />
             VOCÊ NO TIME
           </h3>
           <div className="flex items-center gap-8">
              <div className="text-center">
                 <div className="text-5xl font-black text-primary">3º</div>
                 <p className="text-[10px] font-black uppercase text-muted-foreground mt-1">Sua posição</p>
              </div>
              <div className="flex-1 space-y-4">
                 <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-slate-500">Agilidade</span>
                      <span className="text-xs font-black text-emerald-500">Topo 1%</span>
                    </div>
                    <Progress value={98} className="h-1.5" />
                 </div>
                 <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-slate-500">Fechamento</span>
                      <span className="text-xs font-black text-amber-500">Média 4.5%</span>
                    </div>
                    <Progress value={45} className="h-1.5" />
                 </div>
              </div>
           </div>
        </div>

        <div className="bg-indigo-600 p-6 rounded-[2.5rem] shadow-xl text-white">
           <h3 className="text-lg font-black mb-4 uppercase tracking-tight flex items-center gap-2">
             <BrainCircuit />
             VISÃO DA IA
           </h3>
           <p className="text-indigo-100 font-medium text-sm leading-relaxed">
             "Você está respondendo super rápido, mas a condução está passiva. Seus leads estão esfriando depois que você passa o preço. Foco total em **construção de valor** antes da proposta hoje."
           </p>
           <div className="mt-6 p-4 bg-white/10 rounded-2xl">
              <div className="flex items-center justify-between">
                <div>
                   <div className="text-xs font-bold text-indigo-300 uppercase tracking-widest">Evolução Semanal</div>
                   <div className="text-2xl font-black">+8% em Resp.</div>
                </div>
                <div className="bg-emerald-400 text-slate-900 p-1 rounded-lg">
                   <ArrowUpRight size={24} />
                </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
