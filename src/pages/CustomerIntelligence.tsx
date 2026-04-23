import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Contact, TrendingUp, TrendingDown, Minus, Zap, ShieldCheck, DollarSign,
  Target, ChevronRight, Sparkles, Users, HelpCircle, AlertTriangle, Heart,
  Clock, Headphones, Puzzle, UserCheck, Flame, Loader2, BarChart2,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useCompany } from '../contexts/CompanyContext';
import { supabase } from '../integrations/supabase/client';
import { EmptyState } from '../components/ui/EmptyState';
import { IntelligenceTabs } from '../components/layout/IntelligenceTabs';

type Tab = 'cliente' | 'ciclo';

type CIReport = {
  estagio_funil: string | null;
  urgencia: string | null;
  perfil_comportamental: string | null;
  sensibilidade_preco: string | null;
  nivel_interesse: string | null;
  principais_duvidas: string[];
  principais_objecoes: string[];
  motivadores_compra: string[];
  risco_perda: string | null;
};

const MOCK_CI_REPORTS: CIReport[] = [
  {
    estagio_funil: 'comparando',
    urgencia: 'alta',
    perfil_comportamental: 'analitico',
    sensibilidade_preco: 'alta',
    nivel_interesse: 'alto',
    principais_duvidas: ['Qual diferenca entre plano Pro e Premium?', 'Como funciona a implantacao?'],
    principais_objecoes: ['Preco acima do esperado', 'Preciso validar com o financeiro'],
    motivadores_compra: ['Aumentar conversao de vendas', 'Ganhar velocidade no follow-up'],
    risco_perda: 'medio',
  },
  {
    estagio_funil: 'pesquisando',
    urgencia: 'media',
    perfil_comportamental: 'cauteloso',
    sensibilidade_preco: 'alta',
    nivel_interesse: 'medio',
    principais_duvidas: ['Tem integracao com CRM?', 'Quanto tempo para equipe aprender?'],
    principais_objecoes: ['Equipe pode resistir a mudanca'],
    motivadores_compra: ['Ter mais controle do funil'],
    risco_perda: 'alto',
  },
  {
    estagio_funil: 'pronto_fechar',
    urgencia: 'alta',
    perfil_comportamental: 'impulsivo',
    sensibilidade_preco: 'media',
    nivel_interesse: 'alto',
    principais_duvidas: ['Existe suporte na implantacao?'],
    principais_objecoes: ['Preciso de desconto para fechar hoje'],
    motivadores_compra: ['Melhorar resultado do time comercial', 'Reducao de retrabalho'],
    risco_perda: 'baixo',
  },
  {
    estagio_funil: 'comparando',
    urgencia: 'baixa',
    perfil_comportamental: 'analitico',
    sensibilidade_preco: 'media',
    nivel_interesse: 'medio',
    principais_duvidas: ['Quais indicadores vou acompanhar?', 'Tem caso de sucesso no meu segmento?'],
    principais_objecoes: ['Nao vi diferencial claro ainda'],
    motivadores_compra: ['Tomada de decisao com dados'],
    risco_perda: 'medio',
  },
  {
    estagio_funil: 'pronto_fechar',
    urgencia: 'alta',
    perfil_comportamental: 'cauteloso',
    sensibilidade_preco: 'baixa',
    nivel_interesse: 'alto',
    principais_duvidas: ['Como fica o onboarding dos vendedores novos?'],
    principais_objecoes: ['Preciso alinhar prazo de contrato'],
    motivadores_compra: ['Escalar operacao mantendo qualidade', 'Melhor experiencia do cliente'],
    risco_perda: 'baixo',
  },
  {
    estagio_funil: 'pesquisando',
    urgencia: 'media',
    perfil_comportamental: 'cauteloso',
    sensibilidade_preco: 'alta',
    nivel_interesse: 'medio',
    principais_duvidas: ['Existe periodo de teste?', 'Consigo começar com pacote menor?'],
    principais_objecoes: ['Momento de caixa apertado'],
    motivadores_compra: ['Economia de tempo da equipe'],
    risco_perda: 'alto',
  },
];

// ── Aggregation helpers ───────────────────────────────────────────────────────

function countByField(arr: (string | null)[]): Record<string, number> {
  return arr.reduce((acc, v) => {
    const key = v ?? '—';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function countOcc(arr: string[]): Record<string, number> {
  return arr.reduce((acc, v) => {
    const key = v?.trim();
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function pct(count: number, total: number) {
  if (total === 0) return 0;
  return Math.round((count / total) * 100);
}

function topN(counts: Record<string, number>, n: number): [string, number][] {
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n);
}

function motivatorIcon(text: string): React.ElementType {
  const t = text.toLowerCase();
  if (t.includes('tempo') || t.includes('autom')) return Zap;
  if (t.includes('venda') || t.includes('result') || t.includes('melhora')) return TrendingUp;
  if (t.includes('controle') || t.includes('equipe') || t.includes('gestã')) return UserCheck;
  if (t.includes('urgent') || t.includes('press')) return Flame;
  if (t.includes('experiê') || t.includes('cliente') || t.includes('satisf')) return Heart;
  if (t.includes('preço') || t.includes('custo') || t.includes('econom')) return DollarSign;
  if (t.includes('seguranç') || t.includes('confianç') || t.includes('garanti')) return ShieldCheck;
  return Target;
}

const MOTIVATOR_COLORS = [
  'bg-amber-100 text-amber-600',
  'bg-green-100 text-green-600',
  'bg-violet-100 text-violet-600',
  'bg-rose-100 text-rose-600',
  'bg-blue-100 text-blue-600',
];

const DOUBT_ICONS: React.ElementType[] = [DollarSign, Clock, HelpCircle, Headphones, Puzzle, ShieldCheck, Target];

// ── Shared: MetricCard ───────────────────────────────────────────────────────
function MetricCard({ label, value, icon: Icon, sub, accent }: {
  label: string; value: string; icon: React.ElementType; sub?: string; accent?: boolean;
}) {
  return (
    <div className={cn('rounded-2xl border p-4', accent ? 'border-primary/30 bg-primary/5' : 'border-border bg-card')}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className={cn('mt-1 text-xl font-bold leading-tight', accent ? 'text-primary' : 'text-foreground')}>{value}</p>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', accent ? 'bg-primary/15' : 'bg-muted')}>
          <Icon className={cn('h-4.5 w-4.5', accent ? 'text-primary' : 'text-muted-foreground')} />
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, sub }: { icon: React.ElementType; title: string; sub?: string }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <Icon className="h-4.5 w-4.5 text-primary" />
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {sub && <span className="ml-auto text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

function PatternTag({ text, tone }: { text: string; tone: 'green' | 'amber' | 'violet' | 'blue' | 'rose' }) {
  const cls = {
    green: 'border-[#d3fe18]/50 bg-[#d3fe18]/10 text-[#4a5000]',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    violet: 'border-violet-200 bg-violet-50 text-violet-900',
    blue: 'border-blue-200 bg-blue-50 text-blue-900',
    rose: 'border-rose-200 bg-rose-50 text-rose-900',
  }[tone];
  return (
    <div className={cn('flex items-start gap-2 rounded-xl border px-3 py-2.5', cls)}>
      <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="text-sm leading-snug">{text}</span>
    </div>
  );
}

function Trend({ dir }: { dir: 'up' | 'down' | 'stable' }) {
  if (dir === 'up') return <TrendingUp className="h-3.5 w-3.5 text-rose-500" />;
  if (dir === 'down') return <TrendingDown className="h-3.5 w-3.5 text-green-500" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

interface DoubtRow { icon: React.ElementType; category: string; pct: number; stage: string; trend: 'up' | 'down' | 'stable'; }

function DoubtItem({ item }: { item: DoubtRow }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50">
        <item.icon className="h-4 w-4 text-blue-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{item.category}</p>
        <p className="text-xs text-muted-foreground">Aparece em: {item.stage}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Trend dir={item.trend} />
        <span className="text-sm font-bold text-foreground">{item.pct}%</span>
      </div>
    </div>
  );
}

interface ObjCard { text: string; pct: number; trend: 'up' | 'down' | 'stable'; impact: 'alto' | 'medio' | 'baixo'; context: string; bestAgent: string; }

function ObjectionCard({ obj }: { obj: ObjCard }) {
  const impactCls = { alto: 'bg-rose-100 text-rose-700', medio: 'bg-amber-100 text-amber-700', baixo: 'bg-green-100 text-green-700' }[obj.impact];
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">{obj.text}</p>
        <div className="flex items-center gap-1.5 shrink-0">
          <Trend dir={obj.trend} />
          <span className="text-sm font-bold text-foreground">{obj.pct}%</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <span className={cn('rounded-md px-2 py-0.5 text-xs font-semibold', impactCls)}>impacto {obj.impact}</span>
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{obj.context}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Melhor lida por: </span>{obj.bestAgent}
      </p>
    </div>
  );
}

function MotivatorRow({ icon: Icon, label, pct: p, color }: { icon: React.ElementType; label: string; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-foreground truncate pr-2">{label}</span>
          <span className="text-sm font-bold text-foreground shrink-0">{p}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted">
          <div className="h-1.5 rounded-full bg-primary/60 transition-all duration-500" style={{ width: `${p}%` }} />
        </div>
      </div>
    </div>
  );
}

function StageBadge({ label, pct: p, active }: { label: string; pct: number; active?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center gap-1 rounded-xl border p-3 text-center', active ? 'border-primary/40 bg-primary/8' : 'border-border bg-muted/40')}>
      <span className={cn('text-lg font-bold', active ? 'text-primary' : 'text-foreground')}>{p}%</span>
      <span className="text-xs font-medium text-muted-foreground leading-tight">{label}</span>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function CustomerIntelligence() {
  const [tab, setTab] = useState<Tab>('cliente');
  const { companyId } = useCompany();
  const isLocalhostPreview = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);

  const { data: rawReports = [], isLoading } = useQuery<CIReport[]>({
    queryKey: ['customer-intelligence', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data, error } = await supabase
        .from('customer_intelligence_reports')
        .select('estagio_funil, urgencia, perfil_comportamental, sensibilidade_preco, nivel_interesse, principais_duvidas, principais_objecoes, motivadores_compra, risco_perda')
        .eq('company_id', companyId)
        .gte('analyzed_at', since.toISOString());
      if (error) throw error;
      return (data ?? []) as CIReport[];
    },
    enabled: !!companyId,
    staleTime: 1000 * 60 * 5,
  });

  const effectiveReports = useMemo(() => {
    if (rawReports.length > 0) return rawReports;
    if (isLocalhostPreview) return MOCK_CI_REPORTS;
    return [];
  }, [isLocalhostPreview, rawReports]);

  const agg = useMemo(() => {
    const total = effectiveReports.length;
    if (total === 0) return null;

    const urgenciaCounts = countByField(effectiveReports.map(r => r.urgencia));
    const perfilCounts = countByField(effectiveReports.map(r => r.perfil_comportamental));
    const estagioCounts = countByField(effectiveReports.map(r => r.estagio_funil));
    const sensPrecoCounts = countByField(effectiveReports.map(r => r.sensibilidade_preco));

    const allDuvidas = effectiveReports.flatMap(r => r.principais_duvidas ?? []);
    const allObjecoes = effectiveReports.flatMap(r => r.principais_objecoes ?? []);
    const allMotivadores = effectiveReports.flatMap(r => r.motivadores_compra ?? []);

    const topDuvidas = topN(countOcc(allDuvidas), 7);
    const topObjecoes = topN(countOcc(allObjecoes), 5);
    const topMotivadores = topN(countOcc(allMotivadores), 5);

    // Stage funnel (cumulative)
    const pesquisando = estagioCounts['pesquisando'] ?? 0;
    const comparando = estagioCounts['comparando'] ?? 0;
    const prontoFechar = estagioCounts['pronto_fechar'] ?? 0;
    const highInterest = effectiveReports.filter(r => r.nivel_interesse === 'alto' || r.nivel_interesse === 'medio').length;

    return {
      total,
      urgenciaCounts,
      perfilCounts,
      estagioCounts,
      sensPrecoCounts,
      topDuvidas,
      topObjecoes,
      topMotivadores,
      funilPcts: {
        primeiro_contato: 100,
        interesse: pct(highInterest, total),
        comparando: pct(comparando + prontoFechar, total),
        negociacao: pct(prontoFechar, total),
        fechamento: pct(Math.round(prontoFechar * 0.6), total),
      },
      pesquisandoPct: pct(pesquisando, total),
      comparandoPct: pct(comparando, total),
      prontoFecharPct: pct(prontoFechar, total),
    };
  }, [effectiveReports]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'cliente', label: 'Como o cliente decide' },
    { id: 'ciclo', label: 'Ciclo de Decisao' },
  ];

  if (isLoading && !isLocalhostPreview) {
    return (
      <div className="flex items-center justify-center p-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
            <Contact className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Inteligencia de Cliente</h1>
            <p className="text-sm text-muted-foreground">O que seus clientes pensam, sentem e precisam para decidir</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/8 px-3 py-1">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold text-primary">IA</span>
        </div>
      </div>

      <IntelligenceTabs />

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl border border-border bg-muted/40 p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'rounded-xl px-4 py-1.5 text-sm font-medium transition-all',
              tab === t.id ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!agg ? (
        <EmptyState
          icon={BarChart2}
          title="Nenhum dado de inteligência ainda"
          description="As análises de IA aparecerão aqui após as conversas serem processadas."
        />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <Link to="/playbooks" className="rounded-2xl border border-primary/20 bg-primary/5 p-4 transition-colors hover:border-primary/40 hover:bg-primary/10">
              <p className="text-sm font-semibold text-foreground">Criar playbook para objecoes</p>
              <p className="mt-1 text-xs text-muted-foreground">Transforme as objeções mais frequentes em abordagem padronizada para o time.</p>
            </Link>
            <Link to="/conversations" className="rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-primary/5">
              <p className="text-sm font-semibold text-foreground">Ver conversas com maior friccao</p>
              <p className="mt-1 text-xs text-muted-foreground">Abra as conversas e valide onde as dúvidas e travas estão aparecendo.</p>
            </Link>
            <Link to="/ai-insights" className="rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-primary/5">
              <p className="text-sm font-semibold text-foreground">Abrir analises da IA</p>
              <p className="mt-1 text-xs text-muted-foreground">Cruze falhas, coaching e tags de qualidade para fechar o plano de ação.</p>
            </Link>
          </div>
          {/* ── Tab: Como o cliente decide ──────────────────────────────── */}
          {tab === 'cliente' && (
            <div className="space-y-6">
              {/* Metric cards */}
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <MetricCard label="Conversas analisadas" value={String(agg.total)} icon={Users} sub="ultimos 30 dias" />
                <MetricCard
                  label="Duvida mais frequente"
                  value={agg.topDuvidas[0]?.[0]?.slice(0, 20) ?? '—'}
                  icon={HelpCircle}
                  sub={agg.topDuvidas[0] ? `${pct(agg.topDuvidas[0][1], agg.total)}% das conversas` : undefined}
                  accent
                />
                <MetricCard
                  label="Objecao mais frequente"
                  value={agg.topObjecoes[0]?.[0]?.slice(0, 20) ?? '—'}
                  icon={AlertTriangle}
                  sub={agg.topObjecoes[0] ? `${pct(agg.topObjecoes[0][1], agg.total)}% das conversas` : undefined}
                />
                <MetricCard
                  label="Motivador principal"
                  value={agg.topMotivadores[0]?.[0]?.slice(0, 20) ?? '—'}
                  icon={Zap}
                  sub={agg.topMotivadores[0] ? `${pct(agg.topMotivadores[0][1], agg.total)}% das conversas` : undefined}
                />
              </div>

              {/* ── Bloco 1: Distribuições ─────────────────────────────────── */}
              <div className="rounded-2xl border border-border bg-card p-5">
                <SectionHeader icon={TrendingUp} title="Padroes de Decisao" sub="distribuicao por campo analisado" />

                {/* Motivadores como fatores de decisao */}
                {agg.topMotivadores.length > 0 && (
                  <div className="mb-5 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Motivadores de compra identificados pela IA</p>
                    {agg.topMotivadores.map(([label, count]) => {
                      const Icon = motivatorIcon(label);
                      return (
                        <div key={label} className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-foreground truncate pr-2">{label}</span>
                              <span className="text-sm font-bold text-foreground shrink-0">{pct(count, agg.total)}%</span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-muted">
                              <div className="h-1.5 rounded-full bg-primary/60 transition-all duration-500" style={{ width: `${pct(count, agg.total)}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <hr className="border-border" />

                {/* 4 mini grids */}
                <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
                  {/* Urgencia */}
                  <div className="rounded-xl border border-border bg-muted/30 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Urgencia</p>
                    {[
                      { label: 'Alta', key: 'alta', color: 'bg-rose-500' },
                      { label: 'Media', key: 'media', color: 'bg-amber-400' },
                      { label: 'Baixa', key: 'baixa', color: 'bg-green-400' },
                    ].map(u => (
                      <div key={u.label} className="flex items-center gap-2 text-xs mb-1">
                        <div className={cn('h-2 w-2 rounded-full', u.color)} />
                        <span className="flex-1 text-muted-foreground">{u.label}</span>
                        <span className="font-semibold text-foreground">{pct(agg.urgenciaCounts[u.key] ?? 0, agg.total)}%</span>
                      </div>
                    ))}
                  </div>
                  {/* Perfil */}
                  <div className="rounded-xl border border-border bg-muted/30 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Perfil comportamental</p>
                    {[
                      { label: 'Cauteloso', key: 'cauteloso' },
                      { label: 'Impulsivo', key: 'impulsivo' },
                      { label: 'Analitico', key: 'analitico' },
                    ].map(p => (
                      <div key={p.label} className="flex items-center gap-2 text-xs mb-1">
                        <span className="flex-1 text-muted-foreground">{p.label}</span>
                        <span className="font-semibold text-foreground">{pct(agg.perfilCounts[p.key] ?? 0, agg.total)}%</span>
                      </div>
                    ))}
                  </div>
                  {/* Estagio */}
                  <div className="rounded-xl border border-border bg-muted/30 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Estagio de decisao</p>
                    {[
                      { label: 'Pesquisando', key: 'pesquisando' },
                      { label: 'Comparando', key: 'comparando' },
                      { label: 'Pronto p/ fechar', key: 'pronto_fechar' },
                    ].map(s => (
                      <div key={s.label} className="flex items-center gap-2 text-xs mb-1">
                        <span className="flex-1 text-muted-foreground">{s.label}</span>
                        <span className="font-semibold text-foreground">{pct(agg.estagioCounts[s.key] ?? 0, agg.total)}%</span>
                      </div>
                    ))}
                  </div>
                  {/* Sensibilidade ao preco */}
                  <div className="rounded-xl border border-border bg-muted/30 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Sensibilidade ao preco</p>
                    {[
                      { label: 'Alta', key: 'alta' },
                      { label: 'Media', key: 'media' },
                      { label: 'Baixa', key: 'baixa' },
                    ].map(k => (
                      <div key={k.label} className="flex items-center gap-2 text-xs mb-1">
                        <span className="flex-1 text-muted-foreground">{k.label}</span>
                        <span className="font-semibold text-foreground">{pct(agg.sensPrecoCounts[k.key] ?? 0, agg.total)}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Behavior patterns derived from real data */}
                <div className="mt-5">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Padroes identificados pela IA</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {agg.urgenciaCounts['alta'] && (
                      <PatternTag
                        text={`${pct(agg.urgenciaCounts['alta'], agg.total)}% dos clientes chegam com urgencia alta — decisao rapida esperada`}
                        tone="rose"
                      />
                    )}
                    {agg.perfilCounts['cauteloso'] && (
                      <PatternTag
                        text={`${pct(agg.perfilCounts['cauteloso'], agg.total)}% sao cautelosos — buscam seguranca antes de fechar`}
                        tone="violet"
                      />
                    )}
                    {agg.sensPrecoCounts['alta'] && (
                      <PatternTag
                        text={`${pct(agg.sensPrecoCounts['alta'], agg.total)}% tem alta sensibilidade ao preco — negociam desconto`}
                        tone="amber"
                      />
                    )}
                    {agg.estagioCounts['comparando'] && (
                      <PatternTag
                        text={`${pct(agg.estagioCounts['comparando'], agg.total)}% estao na fase de comparacao — precisam de diferenciais claros`}
                        tone="blue"
                      />
                    )}
                    {agg.estagioCounts['pronto_fechar'] && (
                      <PatternTag
                        text={`${pct(agg.estagioCounts['pronto_fechar'], agg.total)}% estao prontos para fechar — priorize o follow-up`}
                        tone="green"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* ── Bloco 2: Duvidas mais frequentes ─────────────────────── */}
              {agg.topDuvidas.length > 0 && (
                <div className="rounded-2xl border border-border bg-card p-5">
                  <SectionHeader icon={HelpCircle} title="Duvidas mais frequentes" sub="por frequencia nos ultimos 30 dias" />
                  <div className="space-y-2">
                    {agg.topDuvidas.map(([category, count], i) => (
                      <DoubtItem
                        key={category}
                        item={{
                          icon: DOUBT_ICONS[i % DOUBT_ICONS.length],
                          category,
                          pct: pct(count, agg.total),
                          stage: `${count} conversa${count !== 1 ? 's' : ''}`,
                          trend: 'stable',
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* ── Bloco 3: Objecoes mais frequentes ───────────────────── */}
              {agg.topObjecoes.length > 0 && (
                <div className="rounded-2xl border border-border bg-card p-5">
                  <SectionHeader icon={AlertTriangle} title="Objecoes mais frequentes" sub="identificadas pela IA nas conversas" />
                  <div className="space-y-3">
                    {agg.topObjecoes.map(([text, count], i) => (
                      <ObjectionCard
                        key={text}
                        obj={{
                          text,
                          pct: pct(count, agg.total),
                          trend: 'stable',
                          impact: i < 2 ? 'alto' : i < 4 ? 'medio' : 'baixo',
                          context: `Identificada em ${count} conversa${count !== 1 ? 's' : ''}`,
                          bestAgent: '—',
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* ── Bloco 4: Motivadores de compra ──────────────────────── */}
              {agg.topMotivadores.length > 0 && (
                <div className="rounded-2xl border border-border bg-card p-5">
                  <SectionHeader icon={Flame} title="Motivadores de Compra" sub="o que move o cliente a decidir" />
                  <div className="space-y-3">
                    {agg.topMotivadores.map(([label, count], i) => (
                      <MotivatorRow
                        key={label}
                        icon={motivatorIcon(label)}
                        label={label}
                        pct={pct(count, agg.total)}
                        color={MOTIVATOR_COLORS[i % MOTIVATOR_COLORS.length]}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Ciclo de Decisao ────────────────────────────────────── */}
          {tab === 'ciclo' && (
            <div className="rounded-2xl border border-border bg-card p-5">
              <SectionHeader icon={Clock} title="Ciclo de Decisao" sub="distribuicao dos clientes por estagio" />
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                <StageBadge label="Primeiro contato" pct={100} />
                <StageBadge label="Com interesse" pct={agg.funilPcts.interesse} />
                <StageBadge label="Comparando opcoes" pct={agg.funilPcts.comparando} active />
                <StageBadge label="Pronto p/ fechar" pct={agg.funilPcts.negociacao} />
                <StageBadge label="Fechamento" pct={agg.funilPcts.fechamento} />
              </div>
              <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
                {agg.pesquisandoPct > 0 && (
                  <>{agg.pesquisandoPct}% ainda estao na fase de pesquisa. </>
                )}
                {agg.comparandoPct > 0 && (
                  <>{agg.comparandoPct}% estao comparando opcoes — momento critico para apresentar diferenciais. </>
                )}
                {agg.prontoFecharPct > 0 && (
                  <>{agg.prontoFecharPct}% estao prontos para fechar — priorize o acompanhamento.</>
                )}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
