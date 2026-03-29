import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import AIInsights from './AIInsights';
import Audit from './Audit';
import RevenueInsights from './RevenueInsights';
import Performance from './Performance';
import ProductIntelligence from './ProductIntelligence';
import CustomerIntelligence from './CustomerIntelligence';

const TABS = [
  { value: 'ai', label: 'Análise de IA' },
  { value: 'auditoria', label: 'Auditoria' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'performance', label: 'Performance' },
  { value: 'produto', label: 'Intel. de Produto' },
  { value: 'cliente', label: 'Intel. de Cliente' },
] as const;

export default function Relatorio() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') ?? 'ai';

  function handleTabChange(value: string) {
    setSearchParams({ tab: value }, { replace: true });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Relatório</h1>
        <p className="text-muted-foreground text-sm mt-1">Análises e relatórios consolidados</p>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList className="h-11 gap-1 bg-muted/60 p-1 rounded-xl">
          {TABS.map(t => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="rounded-lg px-5 text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="ai">
          <AIInsights />
        </TabsContent>
        <TabsContent value="auditoria">
          <Audit />
        </TabsContent>
        <TabsContent value="revenue">
          <RevenueInsights />
        </TabsContent>
        <TabsContent value="performance">
          <Performance />
        </TabsContent>
        <TabsContent value="produto">
          <ProductIntelligence />
        </TabsContent>
        <TabsContent value="cliente">
          <CustomerIntelligence />
        </TabsContent>
      </Tabs>
    </div>
  );
}
