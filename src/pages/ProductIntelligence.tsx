import { useState } from 'react';
import {
  Sparkles,
  Brain,
  TrendingUp,
  TrendingDown,
  Minus,
  Package,
  MessageSquare,
  ThumbsDown,
  HelpCircle,
  ChevronRight,
  AlertTriangle,
  Flame,
  Activity,
} from 'lucide-react';
import { cn } from '../lib/utils';

type Tab = 'produto' | 'objecoes';

// ── Shared ───────────────────────────────────────────────────────────────────
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

// ── Product rank row ──────────────────────────────────────────────────────────
interface ProductRow {
  rank: number;
  name: string;
  pct: number;
  trend: 'up' | 'down' | 'stable';
  badge?: string;
  badgeCls?: string;
}

function ProductRankRow({ p }: { p: ProductRow }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
      <span className="w-5 text-center text-xs font-bold text-muted-foreground">{p.rank}</span>
      <span className="flex-1 text-sm font-medium text-foreground">{p.name}</span>
      {p.badge && (
        <span className={cn('rounded-md px-2 py-0.5 text-xs font-semibold', p.badgeCls ?? 'bg-muted text-muted-foreground')}>
          {p.badge}
        </span>
      )}
      <div className="flex items-center gap-1.5 shrink-0">
        <Trend dir={p.trend} />
        <span className="text-sm font-bold text-foreground">{p.pct}%</span>
      </div>
    </div>
  );
}

// ── Product sub-issue row ─────────────────────────────────────────────────────
interface ProductIssueRow {
  product: string;
  issue: string;
  pct: number;
  icon: React.ElementType;
  iconCls: string;
}

function ProductIssueItem({ item }: { item: ProductIssueRow }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
      <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', item.iconCls)}>
        <item.icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{item.product}</p>
        <p className="text-xs text-muted-foreground">{item.issue}</p>
      </div>
      <span className="text-sm font-bold text-foreground shrink-0">{item.pct}%</span>
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
  tip: string;
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
        <span className={cn('rounded-md px-2 py-0.5 text-xs font-semibold', impactCls)}>impacto {obj.impact}</span>
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{obj.context}</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        <span className="font-medium text-primary">Sugestao: </span>{obj.tip}
      </p>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ProductIntelligence() {
  const [tab, setTab] = useState<Tab>('produto');

  // ── Mock data ─────────────────────────────────────────────────────────────
  const mostSearched: ProductRow[] = [
    { rank: 1, name: 'Plano Pro — Monitoramento completo', pct: 38, trend: 'up', badge: 'mais buscado', badgeCls: 'bg-primary/15 text-primary' },
    { rank: 2, name: 'Plano Starter — Ate 5 atendentes', pct: 24, trend: 'stable' },
    { rank: 3, name: 'Add-on IA Avancada', pct: 19, trend: 'up' },
    { rank: 4, name: 'Plano Enterprise — Ilimitado', pct: 12, trend: 'down' },
    { rank: 5, name: 'Consultoria de Implantacao', pct: 7, trend: 'stable' },
  ];

  const mostDoubts: ProductIssueRow[] = [
    { product: 'Add-on IA Avancada', issue: 'Como funciona a analise automatica', pct: 61, icon: HelpCircle, iconCls: 'bg-blue-100 text-blue-600' },
    { product: 'Plano Pro', issue: 'Limite de conversas e custo por extra', pct: 47, icon: HelpCircle, iconCls: 'bg-blue-100 text-blue-600' },
    { product: 'Plano Enterprise', issue: 'SLA e clausulas contratuais', pct: 38, icon: HelpCircle, iconCls: 'bg-blue-100 text-blue-600' },
    { product: 'Consultoria de Implantacao', issue: 'Prazo e escopo incluido', pct: 29, icon: HelpCircle, iconCls: 'bg-blue-100 text-blue-600' },
  ];

  const mostObjections: ProductIssueRow[] = [
    { product: 'Plano Pro', issue: 'Custo-beneficio vs concorrente', pct: 54, icon: ThumbsDown, iconCls: 'bg-rose-100 text-rose-600' },
    { product: 'Add-on IA Avancada', issue: 'Complexidade percebida de uso', pct: 43, icon: ThumbsDown, iconCls: 'bg-rose-100 text-rose-600' },
    { product: 'Plano Starter', issue: 'Limite de atendentes muito restrito', pct: 31, icon: ThumbsDown, iconCls: 'bg-rose-100 text-rose-600' },
    { product: 'Consultoria de Implantacao', issue: 'Nao ve necessidade — quer implantar sozinho', pct: 22, icon: ThumbsDown, iconCls: 'bg-rose-100 text-rose-600' },
  ];

  const losingTraction: ProductIssueRow[] = [
    { product: 'Plano Enterprise', issue: 'Interesse caiu 18% vs mes anterior — decisores nao chegam na conversa', pct: 12, icon: TrendingDown, iconCls: 'bg-amber-100 text-amber-600' },
    { product: 'Consultoria de Implantacao', issue: 'Clientes preferem onboarding self-service', pct: 7, icon: TrendingDown, iconCls: 'bg-amber-100 text-amber-600' },
  ];

  const productPatterns = [
    { text: 'Plano Pro e o mais buscado — mas tambem o que mais gera objecao de preco', tone: 'rose' as const },
    { text: 'Add-on IA gera alto interesse mas baixo entendimento — precisa de demo', tone: 'violet' as const },
    { text: 'Clientes que entendem o ROI do produto Pro convertem 3x mais', tone: 'green' as const },
    { text: 'Plano Starter e porta de entrada mas converte mal — clientes saem para o Pro ou saem', tone: 'amber' as const },
    { text: 'Enterprise perde tração — decisores nao chegam a conversa com o vendedor', tone: 'blue' as const },
  ];

  const objections: ObjCard[] = [
    {
      text: 'Preco alto — nao vejo o retorno',
      pct: 41, trend: 'up', impact: 'alto',
      context: 'Aparece apos apresentacao do Plano Pro — derruba 60% das conversas',
      tip: 'Mostre calculo de ROI: quantas horas economizadas x salario do gestor',
    },
    {
      text: 'Ja tenho outro sistema — nao vou trocar',
      pct: 22, trend: 'stable', impact: 'medio',
      context: 'Clientes que vieram do Google com termos de concorrentes',
      tip: 'Ofeca comparativo direto e migracao assistida gratuita',
    },
    {
      text: 'Vai dar muito trabalho implementar',
      pct: 18, trend: 'up', impact: 'alto',
      context: 'Aparece ao falar do Add-on IA — percebido como complexo',
      tip: 'Destaque que a implantacao media e de 3 dias com suporte dedicado',
    },
    {
      text: 'Nao tenho orcamento agora',
      pct: 14, trend: 'down', impact: 'medio',
      context: 'Sazonal — pico em dezembro e janeiro',
      tip: 'Ofeca plano Starter com upgrade garantido nos 90 dias',
    },
    {
      text: 'Minha equipe nao vai usar',
      pct: 5, trend: 'stable', impact: 'baixo',
      context: 'Aparece em conversas com gestores sem apoio da equipe',
      tip: 'Propose um piloto de 15 dias com 2 atendentes antes de contratar',
    },
  ];

  const tabs: { id: Tab; label: string }[] = [
    { id: 'produto', label: 'Produto' },
    { id: 'objecoes', label: 'Objecoes' },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Inteligencia de Produto</h1>
            <p className="text-sm text-muted-foreground">O que seus clientes buscam, entendem e travam em cada produto</p>
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

      {/* ── Tab: Produto ──────────────────────────────────────────────────── */}
      {tab === 'produto' && (
        <div className="space-y-6">

          {/* Metric cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard label="Produto mais buscado" value="Plano Pro" icon={Flame} sub="38% das conversas" accent />
            <MetricCard label="Produto com mais duvidas" value="Add-on IA" icon={HelpCircle} sub="61% das conversas sobre o produto" />
            <MetricCard label="Produto com mais objecoes" value="Plano Pro" icon={ThumbsDown} sub="54% das objecoes de preco" />
            <MetricCard label="Maior interesse recorrente" value="Add-on IA" icon={TrendingUp} sub="crescendo +22% este mes" />
          </div>

          {/* Ranking de interesse */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <SectionHeader icon={Flame} title="Produtos mais buscados" sub="por presenca nas conversas — seta indica tendencia" />
            <div className="space-y-2">
              {mostSearched.map((p) => <ProductRankRow key={p.name} p={p} />)}
            </div>
          </div>

          {/* Produtos com mais duvidas */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <SectionHeader icon={HelpCircle} title="Produtos com mais duvidas" sub="duvida principal por produto" />
            <div className="space-y-2">
              {mostDoubts.map((item) => <ProductIssueItem key={item.product} item={item} />)}
            </div>
          </div>

          {/* Produtos com mais objecoes */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <SectionHeader icon={AlertTriangle} title="Produtos com mais objecoes" sub="objecao principal por produto" />
            <div className="space-y-2">
              {mostObjections.map((item) => <ProductIssueItem key={item.product} item={item} />)}
            </div>
          </div>

          {/* Produtos que perdem tracao */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <SectionHeader icon={Activity} title="Produtos que mais perdem tracao" sub="interesse em queda — requer atencao" />
            {losingTraction.length > 0 ? (
              <div className="space-y-2">
                {losingTraction.map((item) => <ProductIssueItem key={item.product} item={item} />)}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum produto com queda significativa neste periodo.</p>
            )}
          </div>

          {/* Padroes IA */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <SectionHeader icon={Brain} title="Padroes Identificados pela IA" />
            <div className="grid gap-2 sm:grid-cols-2">
              {productPatterns.map((p) => <PatternTag key={p.text} text={p.text} tone={p.tone} />)}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Objecoes ─────────────────────────────────────────────────── */}
      {tab === 'objecoes' && (
        <div className="space-y-6">
          {/* Metric cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <MetricCard label="Objecao mais frequente" value="Preco alto" icon={ThumbsDown} sub="41% das conversas" accent />
            <MetricCard label="Objecao crescendo" value="Impl. complexo" icon={TrendingUp} sub="+9pp no ultimo mes" />
            <MetricCard label="Objecao em queda" value="Sem orcamento" icon={TrendingDown} sub="−4pp este mes" />
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <SectionHeader
              icon={MessageSquare}
              title="Principais Objecoes de Produto"
              sub="contexto, impacto, tendencia e sugestao de resposta"
            />
            <div className="space-y-3">
              {objections.map((o) => <ObjectionCard key={o.text} obj={o} />)}
            </div>
            <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
              <span className="font-medium text-foreground">Legenda: </span>
              seta vermelha = objecao crescendo (alerta), verde = caindo (positivo), traco = estavel.
              Impacto alto = derruba a conversa em mais de 50% dos casos.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
