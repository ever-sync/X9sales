import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon?: ReactNode;
  iconBg?: string;
  trend?: number | null;
  trendLabel?: string;
  className?: string;
}

export function MetricCard({
  title,
  value,
  subtitle,
  icon,
  iconBg = 'bg-accent',
  trend,
  trendLabel,
  className,
}: MetricCardProps) {
  const isPositive = trend != null && trend >= 0;

  return (
    <div className={cn(
      'bg-card rounded-xl border border-border p-5 flex flex-col gap-3',
      className
    )}>
      {/* Top row: icon + title + info dot */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {icon && (
            <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', iconBg)}>
              {icon}
            </div>
          )}
          <p className="text-[12px] font-semibold text-muted-foreground leading-tight">{title}</p>
        </div>
        {/* Info indicator */}
        <div className="h-5 w-5 rounded-full border border-border flex items-center justify-center">
          <span className="text-[9px] font-bold text-muted-foreground">i</span>
        </div>
      </div>

      {/* Value */}
      <p className="text-[28px] font-bold tracking-tight text-foreground leading-none">
        {value}
      </p>

      {/* Trend pill + subtitle */}
      <div className="flex items-center gap-2 flex-wrap">
        {trend != null && (
          <span className={cn(
            'inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full',
            isPositive
              ? 'bg-emerald-50 text-emerald-600'
              : 'bg-red-50 text-red-600'
          )}>
            {isPositive
              ? <TrendingUp className="h-3 w-3" />
              : <TrendingDown className="h-3 w-3" />
            }
            {isPositive ? '+' : ''}{trend.toFixed(1)}%
          </span>
        )}
        {(subtitle || trendLabel) && (
          <span className="text-[11px] text-muted-foreground">{trendLabel ?? subtitle}</span>
        )}
      </div>
    </div>
  );
}
