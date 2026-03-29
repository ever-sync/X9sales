import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, TrendingUp, Activity } from 'lucide-react';

export function BottomNav() {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/' && location.pathname === '/') return true;
    if (path !== '/' && location.pathname.startsWith(path)) return true;
    return false;
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 px-6 pb-6 pt-2 bg-gradient-to-t from-background via-background/95 to-transparent pointer-events-none">
      <div className="mx-auto max-w-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-[2.5rem] shadow-2xl flex items-center justify-between px-4 py-2 pointer-events-auto">
        
        {/* Dashboard */}
        <Link 
          to="/" 
          className={`flex flex-col items-center justify-center w-16 h-12 rounded-2xl transition-all ${
            isActive('/') ? 'text-primary scale-110' : 'text-muted-foreground'
          }`}
        >
          <LayoutDashboard size={22} strokeWidth={isActive('/') ? 3 : 2} />
          <span className="text-[10px] font-bold mt-1 uppercase tracking-tighter">Início</span>
        </Link>

        {/* Vendas (BOTAO DO MEIO VERDE E MAIOR) */}
        <div className="relative -mt-10">
          <Link 
            to="/sales" 
            className={`flex items-center justify-center w-16 h-16 rounded-full shadow-lg shadow-primary/30 transition-all hover:scale-110 active:scale-95 ${
              isActive('/sales') 
              ? 'bg-primary text-primary-foreground border-4 border-white dark:border-slate-900' 
              : 'bg-primary text-primary-foreground border-4 border-white dark:border-slate-900'
            }`}
          >
            <TrendingUp size={28} strokeWidth={3} />
          </Link>
          <div className="text-center mt-1">
            <span className="text-[10px] font-black text-primary uppercase tracking-tighter">Vendas</span>
          </div>
        </div>

        {/* Performance */}
        <Link 
          to="/performance" 
          className={`flex flex-col items-center justify-center w-16 h-12 rounded-2xl transition-all ${
            isActive('/performance') ? 'text-primary scale-110' : 'text-muted-foreground'
          }`}
        >
          <Activity size={22} strokeWidth={isActive('/performance') ? 3 : 2} />
          <span className="text-[10px] font-bold mt-1 uppercase tracking-tighter">Foco</span>
        </Link>

      </div>
    </nav>
  );
}
