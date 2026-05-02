import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { useDailyTrend } from '../../hooks/useDashboardMetrics';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Filter, ArrowUpDown } from 'lucide-react';

export function SLAChart() {
  const { data: trends, isLoading } = useDailyTrend(30);

  if (isLoading) {
    return (
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="h-5 bg-muted rounded w-40 mb-1 animate-pulse" />
        <div className="h-3 bg-muted rounded w-24 mb-5 animate-pulse" />
        <div className="h-64 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  // Aggregate by date (across channels)
  const byDate = new Map<string, { sla_sum: number; count: number; conversations: number }>();
  for (const t of (trends ?? [])) {
    const existing = byDate.get(t.conversation_date) ?? { sla_sum: 0, count: 0, conversations: 0 };
    existing.sla_sum += (t.sla_pct ?? 0) * t.conversation_count;
    existing.count += t.conversation_count;
    existing.conversations += t.conversation_count;
    byDate.set(t.conversation_date, existing);
  }

  const chartData = Array.from(byDate.entries())
    .map(([date, { sla_sum, count, conversations }]) => ({
      date,
      sla: count > 0 ? parseFloat((sla_sum / count).toFixed(1)) : 0,
      conversations,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const latestSla = chartData.at(-1)?.sla ?? 0;
  const totalConvs = chartData.reduce((s, d) => s + d.conversations, 0);

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      {/* Card header */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              SLA Primeira Resposta
            </p>
            <p className="text-[28px] font-bold text-foreground leading-none">
              {latestSla.toFixed(1)}%
            </p>
            <p className="text-[12px] text-muted-foreground mt-1">
              {totalConvs.toLocaleString('pt-BR')} conversas nos últimos 30 dias
            </p>
          </div>
          {/* Controls */}
          <div className="flex items-center gap-1.5">
            <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-[11px] font-semibold text-muted-foreground hover:bg-muted transition-colors">
              <Filter className="h-3 w-3" />
              Filtrar
            </button>
            <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-[11px] font-semibold text-muted-foreground hover:bg-muted transition-colors">
              <ArrowUpDown className="h-3 w-3" />
              Ordenar
            </button>
            <button className="h-7 w-7 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors">
              <span className="text-muted-foreground text-lg leading-none -mt-1">···</span>
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-1 rounded-full bg-primary/90 inline-block" />
            <span className="text-[11px] text-muted-foreground font-medium">SLA %</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-1 rounded-full bg-emerald-400 inline-block border-dashed border-t border-emerald-400" />
            <span className="text-[11px] text-muted-foreground font-medium">Meta 90%</span>
          </div>
        </div>
      </div>

      {/* Chart */}
      {chartData.length === 0 ? (
        <div className="px-5 pb-5 text-center text-[13px] text-muted-foreground">
          Sem dados de tendência
        </div>
      ) : (
        <div className="h-56 px-2 pb-4">
          <ResponsiveContainer width="99%" height="100%" minWidth={0} minHeight={1}>
            <LineChart data={chartData} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={d => format(parseISO(d), 'dd/MM', { locale: ptBR })}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 4px 12px rgba(0,0,0,.06)',
                }}
                formatter={(value, name) => {
                  const numericValue =
                    typeof value === 'number'
                      ? value
                      : Number(value ?? 0);
                  if (name === 'sla') return [`${numericValue}%`, 'SLA'];
                  return [numericValue, 'Conversas'];
                }}
                labelFormatter={d => format(parseISO(d as string), "dd 'de' MMM", { locale: ptBR })}
              />
              <ReferenceLine y={90} stroke="#34d399" strokeDasharray="5 4" strokeWidth={1.5} />
              <Line
                type="monotone"
                dataKey="sla"
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#6366f1', strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
