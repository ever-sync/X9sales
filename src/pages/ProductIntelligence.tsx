import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Sparkles, Brain, TrendingUp, TrendingDown, Minus, Package, MessageSquare,
  ThumbsDown, HelpCircle, ChevronRight, AlertTriangle, Flame, Activity, Loader2, BarChart2,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useCompany } from '../contexts/CompanyContext';
import { supabase } from '../integrations/supabase/client';
import { EmptyState } from '../components/ui/EmptyState';

type Tab = 'produto' | 'objecoes';

type PIReport = {
  produto_citado: string | null;
  produto_interesse: string | null;
  produtos_comparados: string[];
  motivo_interesse: string | null;
  dificuldade_entendimento: string | null;
  barreiras_produto: string[];
  objecao_tratada: boolean | null;
  oportunidade_perdida: boolean | null;
};

// ── Aggregation helpers ───────────────────────────────────────────────────────

function countOcc(arr: (string | null)[]): Record<string, number> {
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

// ── Shared ───────────────────────────────────────────────────────────────────
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

interface ProductRow { rank: number; name: string; pct: number; trend: 'up' | 'down' | 'stable'; badge?: string; badgeCls?: string; }

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

interface ProductIssueRow { product: string; issue: string; pct: number; icon: React.ElementType; iconCls: string; }

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

interface ObjCard { text: string; pct: number; trend: 'up' | 'down' | 'stable'; impact: 'alto' | 'medio' | 'baixo'; context: string; tip: string; }

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
  const { companyId } = useCompany();

  const { data: rawReports = [], isLoading } = useQuery<PIReport[]>({
    queryKey: ['product-intelligence', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data, error } = await supabase
        .from('product_intelligence_reports')
        .select('produto_citado, produto_interesse, produtos_comparados, motivo_interesse, dificuldade_entendimento, barreiras_produto, objecao_tratada, oportunidade_perdida')
        .eq('company_id', companyId)
        .gte('analyzed_at', since.toISOString());
      if (error) throw error;
      return (data ?? []) as PIReport[];
    },
    enabled: !!companyId,
    staleTime: 1000 * 60 * 5,
  });

  const agg = useMemo(() => {
    const total = rawReports.length;
    if (total === 0) return null;

    // Top products by interest
    const interestCounts = countOcc(rawReports.map(r => r.produto_interesse));
    const topInterest = topN(interestCounts, 5);

    // Products with most understanding difficulty
    const highDiffReports = rawReports.filter(r => r.dificuldade_entendimento === 'alto');
    const highDiffCounts = countOcc(highDiffReports.map(r => r.produto_citado));
    const topHighDiff = topN(highDiffCounts, 4);

    // Products with most lost opportunities (objections not handled)
    const lostReports = rawReports.filter(r => r.oportunidade_perdida === true);
    const lostCounts = countOcc(lostReports.map(r => r.produto_citado));
    const topLost = topN(lostCounts, 4);

    // Products losing traction (high loss rate)
    const productStats: Record<string, { total: number; lost: number }> = {};
    rawReports.forEach(r => {
      const prod = r.produto_citado ?? r.produto_interesse;
      if (!prod) return;
      if (!productStats[prod]) productStats[prod] = { total: 0, lost: 0 };
      productStats[prod].total++;
      if (r.oportunidade_perdida) productStats[prod].lost++;
    });
    const losingTraction = Object.entries(productStats)
      .filter(([, s]) => s.total >= 3 && s.lost / s.total > 0.4)
      .sort((a, b) => (b[1].lost / b[1].total) - (a[1].lost / a[1].total))
      .slice(0, 3);

    // Top barriers/objections
    const allBarriers = rawReports.flatMap(r => r.barreiras_produto ?? []);
    const topBarriers = topN(countOcc(allBarriers), 5);

    // Most common motivo_interesse per product
    const motivoByProduct: Record<string, string> = {};
    rawReports.forEach(r => {
      const prod = r.produto_citado ?? r.produto_interesse;
      if (prod && r.motivo_interesse && !motivoByProduct[prod]) {
        motivoByProduct[prod] = r.motivo_interesse;
      }
    });

    return {
      total,
      topInterest,
      topHighDiff,
      topLost,
      losingTraction,
      topBarriers,
      motivoByProduct,
      highDiffTotal: highDiffReports.length,
      lostTotal: lostReports.length,
    };
  }, [rawReports]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'produto', label: 'Produto' },
    { id: 'objecoes', label: 'Objecoes' },
  ];

  if (isLoading) {
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

      {!agg ? (
        <EmptyState
          icon={BarChart2}
          title="Nenhum dado de inteligência ainda"
          description="As análises de produto aparecerão aqui após as conversas serem processadas."
        />
      ) : (
        <>
          {/* ── Tab: Produto ─────────────────────────────────────────────── */}
          {tab === 'produto' && (
            <div className="space-y-6">
              {/* Metric cards */}
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <MetricCard
                  label="Produto mais buscado"
                  value={agg.topInterest[0]?.[0]?.slice(0, 20) ?? '—'}
                  icon={Flame}
                  sub={agg.topInterest[0] ? `${pct(agg.topInterest[0][1], agg.total)}% das conversas` : undefined}
                  accent
                />
                <MetricCard
                  label="Produto com mais duvidas"
                  value={agg.topHighDiff[0]?.[0]?.slice(0, 20) ?? '—'}
                  icon={HelpCircle}
                  sub={agg.highDiffTotal > 0 ? `${pct(agg.highDiffTotal, agg.total)}% com dificuldade alta` : undefined}
                />
                <MetricCard
                  label="Mais oportunidades perdidas"
                  value={agg.topLost[0]?.[0]?.slice(0, 20) ?? '—'}
                  icon={ThumbsDown}
                  sub={agg.lostTotal > 0 ? `${pct(agg.lostTotal, agg.total)}% das conversas` : undefined}
                />
                <MetricCard
                  label="Conversas analisadas"
                  value={String(agg.total)}
                  icon={TrendingUp}
                  sub="ultimos 30 dias"
                />
              </div>

              {/* Ranking de interesse */}
              {agg.topInterest.length > 0 && (
                <div className="rounded-2xl border border-border bg-card p-5">
                  <SectionHeader icon={Flame} title="Produtos mais buscados" sub="por presenca nas conversas" />
                  <div className="space-y-2">
                    {agg.topInterest.map(([name, count], i) => (
                      <ProductRankRow
                        key={name}
                        p={{
                          rank: i + 1,
                          name,
                          pct: pct(count, agg.total),
                          trend: 'stable',
                          badge: i === 0 ? 'mais buscado' : undefined,
                          badgeCls: i === 0 ? 'bg-primary/15 text-primary' : undefined,
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Produtos com mais duvidas */}
              {agg.topHighDiff.length > 0 && (
                <div className="rounded-2xl border border-border bg-card p-5">
                  <SectionHeader icon={HelpCircle} title="Produtos com mais duvidas" sub="dificuldade de entendimento alta" />
                  <div className="space-y-2">
                    {agg.topHighDiff.map(([product, count]) => (
                      <ProductIssueItem
                        key={product}
                        item={{
                          product,
                          issue: agg.motivoByProduct[product] ?? 'Dificuldade de entendimento identificada',
                          pct: pct(count, agg.total),
                          icon: HelpCircle,
                          iconCls: 'bg-blue-100 text-blue-600',
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Produtos com mais oportunidades perdidas */}
              {agg.topLost.length > 0 && (
                <div className="rounded-2xl border border-border bg-card p-5">
                  <SectionHeader icon={AlertTriangle} title="Produtos com mais objecoes" sub="oportunidades perdidas por produto" />
                  <div className="space-y-2">
                    {agg.topLost.map(([product, count]) => (
                      <ProductIssueItem
                        key={product}
                        item={{
                          product,
                          issue: 'Objecao nao tratada — oportunidade perdida',
                          pct: pct(count, agg.total),
                          icon: ThumbsDown,
                          iconCls: 'bg-rose-100 text-rose-600',
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Produtos que perdem tracao */}
              <div className="rounded-2xl border border-border bg-card p-5">
                <SectionHeader icon={Activity} title="Produtos que mais perdem tracao" sub="taxa de perda acima de 40%" />
                {agg.losingTraction.length > 0 ? (
                  <div className="space-y-2">
                    {agg.losingTraction.map(([product, stats]) => (
                      <ProductIssueItem
                        key={product}
                        item={{
                          product,
                          issue: `${Math.round((stats.lost / stats.total) * 100)}% das conversas resultam em perda — requer atencao`,
                          pct: pct(stats.lost, stats.total),
                          icon: TrendingDown,
                          iconCls: 'bg-amber-100 text-amber-600',
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum produto com queda significativa neste periodo.</p>
                )}
              </div>

              {/* Padroes IA */}
              <div className="rounded-2xl border border-border bg-card p-5">
                <SectionHeader icon={Brain} title="Padroes Identificados pela IA" />
                <div className="grid gap-2 sm:grid-cols-2">
                  {agg.topInterest[0] && (
                    <PatternTag
                      text={`${agg.topInterest[0][0]} e o mais buscado — ${pct(agg.topInterest[0][1], agg.total)}% das conversas`}
                      tone="rose"
                    />
                  )}
                  {agg.highDiffTotal > 0 && (
                    <PatternTag
                      text={`${pct(agg.highDiffTotal, agg.total)}% das conversas com dificuldade alta de entendimento — requer demo ou material explicativo`}
                      tone="violet"
                    />
                  )}
                  {agg.lostTotal > 0 && (
                    <PatternTag
                      text={`${pct(agg.lostTotal, agg.total)}% das conversas resultaram em oportunidade perdida — revisar abordagem de objecoes`}
                      tone="amber"
                    />
                  )}
                  {agg.topBarriers[0] && (
                    <PatternTag
                      text={`Barreira mais comum: "${agg.topBarriers[0][0]}" — presente em ${agg.topBarriers[0][1]} conversas`}
                      tone="blue"
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Tab: Objecoes ────────────────────────────────────────────── */}
          {tab === 'objecoes' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                <MetricCard
                  label="Objecao mais frequente"
                  value={agg.topBarriers[0]?.[0]?.slice(0, 20) ?? '—'}
                  icon={ThumbsDown}
                  sub={agg.topBarriers[0] ? `${pct(agg.topBarriers[0][1], agg.total)}% das conversas` : undefined}
                  accent
                />
                <MetricCard
                  label="Oportunidades perdidas"
                  value={`${pct(agg.lostTotal, agg.total)}%`}
                  icon={TrendingDown}
                  sub={`${agg.lostTotal} de ${agg.total} conversas`}
                />
                <MetricCard
                  label="Conversas analisadas"
                  value={String(agg.total)}
                  icon={MessageSquare}
                  sub="ultimos 30 dias"
                />
              </div>

              {agg.topBarriers.length > 0 ? (
                <div className="rounded-2xl border border-border bg-card p-5">
                  <SectionHeader
                    icon={MessageSquare}
                    title="Principais Barreiras de Produto"
                    sub="identificadas pela IA nas conversas"
                  />
                  <div className="space-y-3">
                    {agg.topBarriers.map(([text, count], i) => (
                      <ObjectionCard
                        key={text}
                        obj={{
                          text,
                          pct: pct(count, agg.total),
                          trend: 'stable',
                          impact: i < 2 ? 'alto' : i < 4 ? 'medio' : 'baixo',
                          context: `Identificada em ${count} conversa${count !== 1 ? 's' : ''}`,
                          tip: 'Revisar playbook de objecoes para este produto.',
                        }}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={ThumbsDown}
                  title="Nenhuma barreira identificada"
                  description="As barreiras de produto aparecerão após análise das conversas."
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
