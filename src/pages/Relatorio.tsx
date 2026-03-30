import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Brain, Boxes, FileSearch, LineChart, MessageCircleMore, Sparkles } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { cn } from '../lib/utils';
import AIInsights from './AIInsights';
import Audit from './Audit';
import RevenueInsights from './RevenueInsights';
import Performance from './Performance';
import ProductIntelligence from './ProductIntelligence';
import CustomerIntelligence from './CustomerIntelligence';

type PrimaryTab = 'ia' | 'auditoria' | 'revenue' | 'performance';
type ReportTab = 'ai' | 'produto' | 'cliente' | 'auditoria' | 'revenue' | 'performance';

const PRIMARY_TABS: Array<{
  value: PrimaryTab;
  label: string;
  icon: React.ElementType;
}> = [
  { value: 'ia', label: 'IA analise', icon: Brain },
  { value: 'auditoria', label: 'Auditoria', icon: FileSearch },
  { value: 'revenue', label: 'Revenue', icon: LineChart },
  { value: 'performance', label: 'Performance', icon: Sparkles },
];

const IA_SUBTABS: Array<{
  value: Extract<ReportTab, 'ai' | 'produto' | 'cliente'>;
  label: string;
  icon: React.ElementType;
  description: string;
}> = [
  {
    value: 'ai',
    label: 'Análise de IA',
    icon: Brain,
    description: 'Qualidade, coaching e falhas recorrentes nas conversas.',
  },
  {
    value: 'produto',
    label: 'Intel. de Produto',
    icon: Boxes,
    description: 'O que seus clientes buscam, entendem e travam em cada produto.',
  },
  {
    value: 'cliente',
    label: 'Intel. de Cliente',
    icon: MessageCircleMore,
    description: 'Perfil, momento de compra e sinais reais do cliente.',
  },
];

function resolvePrimaryTab(tab: string | null): PrimaryTab {
  if (tab === 'auditoria' || tab === 'revenue' || tab === 'performance') return tab;
  return 'ia';
}

function resolveReportTab(tab: string | null): ReportTab {
  if (tab === 'produto' || tab === 'cliente' || tab === 'auditoria' || tab === 'revenue' || tab === 'performance') {
    return tab;
  }
  return 'ai';
}

export default function Relatorio() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = resolveReportTab(searchParams.get('tab'));
  const primaryTab = resolvePrimaryTab(searchParams.get('tab'));

  const activeIASubtab = useMemo(
    () => IA_SUBTABS.find((item) => item.value === tab) ?? IA_SUBTABS[0],
    [tab],
  );

  function handlePrimaryTabChange(value: string) {
    const next = value === 'ia' ? 'ai' : value;
    setSearchParams({ tab: next }, { replace: true });
  }

  function handleIASubtabChange(value: string) {
    setSearchParams({ tab: value }, { replace: true });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Relatório</h1>
        <p className="mt-1 text-sm text-muted-foreground">Análises e relatórios consolidados</p>
      </div>

      <Tabs value={primaryTab} onValueChange={handlePrimaryTabChange} className="space-y-5">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-2 rounded-[22px] border border-border bg-white p-2 shadow-sm">
          {PRIMARY_TABS.map((item) => (
            <TabsTrigger
              key={item.value}
              value={item.value}
              className="rounded-2xl px-4 py-2.5 text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <item.icon className="mr-2 h-4 w-4" />
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {primaryTab === 'ia' && (
          <div className="rounded-[26px] border border-border bg-white p-3 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
            <Tabs value={tab} onValueChange={handleIASubtabChange} className="space-y-4">
              <TabsList className="h-auto w-full flex-wrap justify-start gap-2 rounded-[20px] bg-muted/50 p-2">
                {IA_SUBTABS.map((item) => (
                  <TabsTrigger
                    key={item.value}
                    value={item.value}
                    className="rounded-2xl px-4 py-2.5 text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                  >
                    <item.icon className="mr-2 h-4 w-4" />
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="rounded-[22px] border border-border/70 bg-background px-4 py-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-accent text-secondary">
                    <activeIASubtab.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold tracking-[-0.03em] text-foreground">
                      {activeIASubtab.label}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {activeIASubtab.description}
                    </p>
                  </div>
                </div>
              </div>
            </Tabs>
          </div>
        )}

        <TabsContent value="ia" className="mt-0">
          <div className="space-y-5">
            <div className={cn(tab !== 'ai' && 'hidden')}>
              <AIInsights />
            </div>
            <div className={cn(tab !== 'produto' && 'hidden')}>
              <ProductIntelligence />
            </div>
            <div className={cn(tab !== 'cliente' && 'hidden')}>
              <CustomerIntelligence />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="auditoria" className="mt-0">
          <Audit />
        </TabsContent>
        <TabsContent value="revenue" className="mt-0">
          <RevenueInsights />
        </TabsContent>
        <TabsContent value="performance" className="mt-0">
          <Performance />
        </TabsContent>
      </Tabs>
    </div>
  );
}
