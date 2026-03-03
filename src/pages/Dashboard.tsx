import { OverviewPanel } from '../components/dashboard/OverviewPanel';
import { AgentRankingTable } from '../components/dashboard/AgentRankingTable';
import { SLAChart } from '../components/dashboard/SLAChart';
import { AlertsList } from '../components/dashboard/AlertsList';
import { Filter, Download, CalendarDays } from 'lucide-react';

export default function Dashboard() {
  const today = new Date();
  const from = new Date(today);
  from.setDate(today.getDate() - 29);

  const fmt = (d: Date) =>
    d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Dashboard</h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">Visão geral do desempenho da equipe</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Date range chip */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border text-[12px] font-semibold text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
            {fmt(from)} – {fmt(today)}
            <span className="ml-1 px-1.5 py-0.5 rounded bg-muted text-[11px] font-bold text-muted-foreground">
              Mensal
            </span>
          </div>

          {/* Filter button */}
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border text-[12px] font-semibold text-muted-foreground hover:bg-muted transition-colors">
            <Filter className="h-3.5 w-3.5" />
            Filtros
          </button>

          {/* Export button */}
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border text-[12px] font-semibold text-muted-foreground hover:bg-muted transition-colors">
            <Download className="h-3.5 w-3.5" />
            Exportar
          </button>
        </div>
      </div>

      {/* Metric cards */}
      <OverviewPanel />

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <SLAChart />
        </div>
        <AlertsList />
      </div>

      {/* Ranking table */}
      <AgentRankingTable />
    </div>
  );
}
