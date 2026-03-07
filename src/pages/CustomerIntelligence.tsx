import { useState } from 'react';
import {
  Contact,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  ShieldCheck,
  DollarSign,
  Star,
  Target,
  ChevronRight,
  Sparkles,
  Users,
  HelpCircle,
  AlertTriangle,
  Heart,
  Clock,
  Headphones,
  Puzzle,
  FileText,
  UserCheck,
  Flame,
} from 'lucide-react';
import { cn } from '../lib/utils';

type Tab = 'cliente' | 'ciclo';

// ── Shared: MetricCard ───────────────────────────────────────────────────────
function MetricCard({
  label, value, icon: Icon, sub, accent,
}: {
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

// ── Shared: SectionHeader ────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, title, sub }: { icon: React.ElementType; title: string; sub?: string }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <Icon className="h-4.5 w-4.5 text-primary" />
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {sub && <span className="ml-auto text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

// ── Shared: PatternTag ───────────────────────────────────────────────────────
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

// ── Trend icon ────────────────────────────────────────────────────────────────
function Trend({ dir }: { dir: 'up' | 'down' | 'stable' }) {
  if (dir === 'up') return <TrendingUp className="h-3.5 w-3.5 text-rose-500" />;
  if (dir === 'down') return <TrendingDown className="h-3.5 w-3.5 text-green-500" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

// ── Doubt row ─────────────────────────────────────────────────────────────────
interface DoubtRow {
  icon: React.ElementType;
  category: string;
  pct: number;
  stage: string;
  trend: 'up' | 'down' | 'stable';
}

function DoubtItem({ item }: { item: DoubtRow }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50">
        <item.icon className="h-4 w-4 text-blue-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{item.category}</p>
        <p className="text-xs text-muted-foreground">Aparece em: {item.stage}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Trend dir={item.trend} />
        <span className="text-sm font-bold text-foreground">{item.pct}%</span>
      </div>
    </div>
  );
}

// ── Objection card ─────────────────────────────────────────────────────────────
interface ObjCard {
  text: string;
  pct: number;
  trend: 'up' | 'down' | 'stable';
  impact: 'alto' | 'medio' | 'baixo';
  context: string;
  bestAgent: string;
}

function ObjectionCard({ obj }: { obj: ObjCard }) {
  const impactCls = {
    alto: 'bg-rose-100 text-rose-700',
    medio: 'bg-amber-100 text-amber-700',
    baixo: 'bg-green-100 text-green-700',
  }[obj.impact];

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
        <span className={cn('rounded-md px-2 py-0.5 text-xs font-semibold', impactCls)}>
          impacto {obj.impact}
        </span>
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {obj.context}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Melhor lida por: </span>{obj.bestAgent}
      </p>
    </div>
  );
}

// ── Motivator row ──────────────────────────────────────────────────────────────
function MotivatorRow({ icon: Icon, label, pct, color }: { icon: React.ElementType; label: string; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-foreground">{label}</span>
          <span className="text-sm font-bold text-foreground">{pct}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted">
          <div className="h-1.5 rounded-full bg-primary/60 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

// ── StageBadge ────────────────────────────────────────────────────────────────
function StageBadge({ label, pct, active }: { label: string; pct: number; active?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center gap-1 rounded-xl border p-3 text-center', active ? 'border-primary/40 bg-primary/8' : 'border-border bg-muted/40')}>
      <span className={cn('text-lg font-bold', active ? 'text-primary' : 'text-foreground')}>{pct}%</span>
      <span className="text-xs font-medium text-muted-foreground leading-tight">{label}</span>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function CustomerIntelligence() {
  const [tab, setTab] = useState<Tab>('cliente');

  // ── Mock data (substituir por chamadas ao backend) ────────────────────────
  const decisionFactors = [
    { label: 'Confianca / Seguranca', pct: 42, color: 'bg-violet-100 text-violet-600', barColor: '#7c3aed', icon: ShieldCheck },
    { label: 'Preco / Custo-beneficio', pct: 31, color: 'bg-amber-100 text-amber-600', barColor: '#d97706', icon: DollarSign },
    { label: 'Rapidez no atendimento', pct: 18, color: 'bg-blue-100 text-blue-600', barColor: '#2563eb', icon: Zap },
    { label: 'Qualidade do produto', pct: 6, color: 'bg-green-100 text-green-600', barColor: '#16a34a', icon: Star },
    { label: 'Resultado esperado', pct: 3, color: 'bg-rose-100 text-rose-600', barColor: '#e11d48', icon: Target },
  ];

  const doubts: DoubtRow[] = [
    { icon: DollarSign, category: 'Preco e planos de pagamento', pct: 42, stage: 'Primeiro contato e proposta', trend: 'up' },
    { icon: Clock, category: 'Prazo de implantacao', pct: 27, stage: 'Pos-interesse', trend: 'stable' },
    { icon: HelpCircle, category: 'Como funciona na pratica', pct: 24, stage: 'Inicio da conversa', trend: 'up' },
    { icon: Headphones, category: 'Suporte apos contratacao', pct: 18, stage: 'Antes de fechar', trend: 'stable' },
    { icon: Puzzle, category: 'Integracao com outras ferramentas', pct: 14, stage: 'Meio da conversa', trend: 'down' },
    { icon: FileText, category: 'Condicoes comerciais e contrato', pct: 9, stage: 'Etapa de proposta', trend: 'stable' },
    { icon: ShieldCheck, category: 'Confianca na empresa / garantias', pct: 7, stage: 'Qualquer etapa', trend: 'down' },
  ];

  const objections: ObjCard[] = [
    {
      text: 'Preco percebido como alto',
      pct: 38,
      trend: 'up',
      impact: 'alto',
      context: 'Aparece apos apresentacao de proposta — derruba 60% das conversas que nao avancam',
      bestAgent: 'Carlos (lida com ROI) e Ana (parcelamento)',
    },
    {
      text: 'Preciso pensar / vou avaliar',
      pct: 29,
      trend: 'stable',
      impact: 'alto',
      context: 'Aparece no final da conversa — indica falta de urgencia criada',
      bestAgent: 'Marcos (cria urgencia com prazo)',
    },
    {
      text: 'Comparacao com concorrente ou solucao atual',
      pct: 19,
      trend: 'up',
      impact: 'medio',
      context: 'Aparece no meio da conversa — clientes que chegaram pelo Google',
      bestAgent: 'Ana (comparativo direto)',
    },
    {
      text: 'Precisa consultar socio ou diretor',
      pct: 11,
      trend: 'stable',
      impact: 'medio',
      context: 'Aparece antes de fechar — indica que decisor nao estava na conversa',
      bestAgent: 'Carlos (envia material para decisor)',
    },
    {
      text: 'Nao e prioridade agora',
      pct: 8,
      trend: 'down',
      impact: 'baixo',
      context: 'Aparece no inicio — clientes frios ou sazonalidade',
      bestAgent: 'Reencaminhar com follow-up em 30 dias',
    },
  ];

  const motivators = [
    { icon: Zap, label: 'Ganhar tempo / automatizar processos', pct: 44, color: 'bg-amber-100 text-amber-600' },
    { icon: TrendingUp, label: 'Melhorar resultados de venda', pct: 38, color: 'bg-green-100 text-green-600' },
    { icon: UserCheck, label: 'Ter mais controle sobre a equipe', pct: 31, color: 'bg-violet-100 text-violet-600' },
    { icon: Flame, label: 'Urgencia / pressao por resultado', pct: 22, color: 'bg-rose-100 text-rose-600' },
    { icon: Heart, label: 'Melhorar experiencia do cliente', pct: 17, color: 'bg-blue-100 text-blue-600' },
  ];

  const behaviorPatterns = [
    { text: 'Buscam seguranca antes de fechar — pedem garantias e referencias', tone: 'violet' as const },
    { text: 'Comparam opcoes com concorrentes antes de decidir', tone: 'amber' as const },
    { text: 'Sensibilidade a preco: negociam desconto em 3 de cada 5 conversas', tone: 'amber' as const },
    { text: 'Valorizam rapidez: 67% mencionam urgencia no primeiro contato', tone: 'green' as const },
    { text: 'Precisam de mais clareza sobre funcionamento antes de avancar', tone: 'blue' as const },
    { text: 'Clientes com conhecimento baixo do produto tem conversao 40% menor', tone: 'blue' as const },
  ];

  const tabs: { id: Tab; label: string }[] = [
    { id: 'cliente', label: 'Como o cliente decide' },
    { id: 'ciclo', label: 'Ciclo de Decisao' },
  ];

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

      {/* ── Tab: Como o cliente decide ───────────────────────────────────── */}
      {tab === 'cliente' && (
        <div className="space-y-6">

          {/* Metric cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard label="Conversas analisadas" value="248" icon={Users} sub="ultimos 30 dias" />
            <MetricCard label="Duvida mais frequente" value="Preco" icon={HelpCircle} sub="aparece em 42% das conversas" accent />
            <MetricCard label="Objecao mais frequente" value="Preco alto" icon={AlertTriangle} sub="38% — tendencia crescente" />
            <MetricCard label="Motivador principal" value="Ganhar tempo" icon={Zap} sub="44% das conversas" />
          </div>

          {/* ── Bloco 1: Padroes de decisao ──────────────────────────────── */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <SectionHeader icon={TrendingUp} title="Padroes de Decisao" sub="o que mais pesa para o cliente comprar" />

            {/* Decision factors bars */}
            <div className="mb-5 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fatores de decisao de compra</p>
              {decisionFactors.map((f) => (
                <div key={f.label} className="flex items-center gap-3">
                  <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', f.color)}>
                    <f.icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-foreground">{f.label}</span>
                      <span className="text-sm font-bold text-foreground">{f.pct}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted">
                      <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${f.pct}%`, backgroundColor: f.barColor }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <hr className="border-border" />

            {/* 4 mini grids */}
            <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {/* Urgencia */}
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Urgencia</p>
                {[{ label: 'Alta', pct: 67, color: 'bg-rose-500' }, { label: 'Media', pct: 25, color: 'bg-amber-400' }, { label: 'Baixa', pct: 8, color: 'bg-green-400' }].map((u) => (
                  <div key={u.label} className="flex items-center gap-2 text-xs mb-1">
                    <div className={cn('h-2 w-2 rounded-full', u.color)} />
                    <span className="flex-1 text-muted-foreground">{u.label}</span>
                    <span className="font-semibold text-foreground">{u.pct}%</span>
                  </div>
                ))}
              </div>
              {/* Perfil */}
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Perfil comportamental</p>
                {[{ label: 'Cauteloso', pct: 48 }, { label: 'Impulsivo', pct: 29 }, { label: 'Analitico', pct: 23 }].map((p) => (
                  <div key={p.label} className="flex items-center gap-2 text-xs mb-1">
                    <span className="flex-1 text-muted-foreground">{p.label}</span>
                    <span className="font-semibold text-foreground">{p.pct}%</span>
                  </div>
                ))}
              </div>
              {/* Estagio */}
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Estagio de decisao</p>
                {[{ label: 'Pesquisando', pct: 35 }, { label: 'Comparando', pct: 42 }, { label: 'Pronto p/ fechar', pct: 23 }].map((s) => (
                  <div key={s.label} className="flex items-center gap-2 text-xs mb-1">
                    <span className="flex-1 text-muted-foreground">{s.label}</span>
                    <span className="font-semibold text-foreground">{s.pct}%</span>
                  </div>
                ))}
              </div>
              {/* Conhecimento */}
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Conhecimento do produto</p>
                {[{ label: 'Alto', pct: 18 }, { label: 'Medio', pct: 45 }, { label: 'Baixo', pct: 37 }].map((k) => (
                  <div key={k.label} className="flex items-center gap-2 text-xs mb-1">
                    <span className="flex-1 text-muted-foreground">{k.label}</span>
                    <span className="font-semibold text-foreground">{k.pct}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Behavior patterns */}
            <div className="mt-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Padroes identificados pela IA</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {behaviorPatterns.map((p) => (
                  <PatternTag key={p.text} text={p.text} tone={p.tone} />
                ))}
              </div>
            </div>
          </div>

          {/* ── Bloco 2: Duvidas mais frequentes ──────────────────────────── */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <SectionHeader icon={HelpCircle} title="Duvidas mais frequentes" sub="por frequencia — seta indica tendencia" />
            <div className="space-y-2">
              {doubts.map((d) => <DoubtItem key={d.category} item={d} />)}
            </div>
            <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
              <span className="font-medium text-foreground">Legenda de tendencia: </span>
              seta para cima = crescendo, para baixo = caindo, traco = estavel nos ultimos 30 dias.
            </p>
          </div>

          {/* ── Bloco 3: Objecoes mais frequentes ─────────────────────────── */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <SectionHeader icon={AlertTriangle} title="Objecoes mais frequentes" sub="contexto, impacto e quem lida melhor" />
            <div className="space-y-3">
              {objections.map((o) => <ObjectionCard key={o.text} obj={o} />)}
            </div>
          </div>

          {/* ── Bloco 4: Motivadores de compra ────────────────────────────── */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <SectionHeader icon={Flame} title="Motivadores de Compra" sub="o que move o cliente a decidir" />
            <div className="space-y-3">
              {motivators.map((m) => (
                <MotivatorRow key={m.label} icon={m.icon} label={m.label} pct={m.pct} color={m.color} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Ciclo de Decisao ──────────────────────────────────────────── */}
      {tab === 'ciclo' && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <SectionHeader icon={Clock} title="Ciclo de Decisao" sub="retencao de clientes por etapa" />
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            <StageBadge label="Primeiro contato" pct={100} />
            <StageBadge label="Interesse demonstrado" pct={74} />
            <StageBadge label="Comparando opcoes" pct={61} active />
            <StageBadge label="Negociacao" pct={38} />
            <StageBadge label="Fechamento" pct={23} />
          </div>
          <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
            Maior drop: entre <strong className="text-foreground">Interesse</strong> e <strong className="text-foreground">Comparacao</strong> (−13 pp).
            Clientes que recebem prova social nessa etapa tem 2x mais chance de avancar.
          </p>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
            Segundo maior drop: entre <strong className="text-foreground">Comparacao</strong> e <strong className="text-foreground">Negociacao</strong> (−23 pp).
            Objecao de preco e o principal motivo identificado pela IA.
          </p>
        </div>
      )}
    </div>
  );
}
