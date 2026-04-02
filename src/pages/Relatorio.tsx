import { useSearchParams } from 'react-router-dom';
import { FileSearch, LineChart, Sparkles } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import Audit from './Audit';
import RevenueInsights from './RevenueInsights';
import Performance from './Performance';

type ReportTab = 'auditoria' | 'revenue' | 'performance';

const REPORT_TABS: Array<{
  value: ReportTab;
  label: string;
  icon: React.ElementType;
}> = [
  { value: 'auditoria', label: 'Auditoria', icon: FileSearch },
  { value: 'revenue', label: 'Revenue', icon: LineChart },
  { value: 'performance', label: 'Performance', icon: Sparkles },
];

function resolveReportTab(tab: string | null): ReportTab {
  if (tab === 'revenue' || tab === 'performance') return tab;
  return 'auditoria';
}

export default function Relatorio() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = resolveReportTab(searchParams.get('tab'));

  function handleTabChange(value: string) {
    setSearchParams({ tab: value }, { replace: true });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Relatório</h1>
        <p className="mt-1 text-sm text-muted-foreground">Análises e relatórios consolidados</p>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange} className="space-y-5">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-2 rounded-[22px] border border-border bg-white p-2 shadow-sm">
          {REPORT_TABS.map((item) => (
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
