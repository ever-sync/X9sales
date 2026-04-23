import { Link, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';

const tabs = [
  { id: 'conversations', label: 'Analise Conversas', to: '/ai-insights' },
  { id: 'product', label: 'Analise Produto', to: '/product-intelligence' },
  { id: 'customer', label: 'Analise Cliente', to: '/customer-intelligence' },
];

export function IntelligenceTabs() {
  const location = useLocation();

  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((item) => {
        const isActive = location.pathname === item.to;
        return (
          <Link
            key={item.id}
            to={item.to}
            className={cn(
              'rounded-xl border px-3 py-2 text-sm font-semibold transition-colors',
              isActive
                ? 'border-primary/35 bg-accent text-primary'
                : 'border-border bg-background text-muted-foreground hover:bg-muted',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

