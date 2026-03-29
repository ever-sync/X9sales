import type { AgentBadge } from '../../types';
import { cn } from '../../lib/utils';
import { Award, Crown, ShieldCheck, Zap } from 'lucide-react';

const BADGE_STYLES: Record<string, { className: string; Icon: typeof Award }> = {
  gold: {
    className: 'border-yellow-300 bg-yellow-50 text-yellow-800',
    Icon: Crown,
  },
  indigo: {
    className: 'border-indigo-300 bg-indigo-50 text-indigo-700',
    Icon: Zap,
  },
  emerald: {
    className: 'border-emerald-300 bg-emerald-50 text-emerald-700',
    Icon: Award,
  },
  amber: {
    className: 'border-amber-300 bg-amber-50 text-amber-700',
    Icon: ShieldCheck,
  },
};

export function BadgePill({
  badge,
  compact = false,
}: {
  badge: Pick<AgentBadge, 'badge_label' | 'badge_tone'>;
  compact?: boolean;
}) {
  const style = BADGE_STYLES[badge.badge_tone] ?? {
    className: 'border-slate-300 bg-slate-50 text-slate-700',
    Icon: Award,
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold',
        compact ? 'text-[10px] uppercase tracking-wide' : 'text-xs',
        style.className,
      )}
    >
      <style.Icon className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      {badge.badge_label}
    </span>
  );
}
