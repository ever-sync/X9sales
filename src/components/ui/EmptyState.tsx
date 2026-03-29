import { cn } from '../../lib/utils';
import { FlaskConical } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  /** Se true, mostra o banner "dados de exemplo" no topo da página */
  demoMode?: boolean;
}

export function DemoBanner() {
  return (
    <div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-3">
      <FlaskConical className="h-4 w-4 shrink-0 text-amber-400" />
      <p className="text-sm text-amber-300/90">
        Você está vendo <span className="font-semibold text-amber-300">dados de exemplo</span>.
        Conecte sua conta para ver dados reais.
      </p>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-white/6 bg-white/[0.02] px-8 py-16 text-center',
        className,
      )}
    >
      {Icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.04]">
          <Icon className="h-7 w-7 text-white/30" />
        </div>
      )}
      <p className="text-base font-semibold text-white/70">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-white/35">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
