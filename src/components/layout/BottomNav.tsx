import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, TrendingUp, Activity, Trophy, User } from 'lucide-react';
import { cn } from '../../lib/utils';

export function BottomNav() {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/' && location.pathname === '/') return true;
    if (path !== '/' && location.pathname.startsWith(path)) return true;
    return false;
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 px-4 pb-6 pt-2 bg-linear-to-t from-background via-background/95 to-transparent pointer-events-none">
      <div className="mx-auto max-w-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-[2.5rem] shadow-2xl flex items-center justify-between px-2 py-2 pointer-events-auto">
        
        {/* Dashboard */}
        <Link 
          to="/" 
          className={cn(
            "flex flex-col items-center justify-center flex-1 h-12 transition-all",
            isActive('/') ? 'text-primary scale-110' : 'text-muted-foreground'
          )}
        >
          <LayoutDashboard size={20} strokeWidth={isActive('/') ? 3 : 2} />
          <span className="text-[10px] font-bold mt-1 uppercase tracking-tighter">Início</span>
        </Link>

        {/* Ranking */}
        <Link 
          to="/ranking" 
          className={cn(
            "flex flex-col items-center justify-center flex-1 h-12 transition-all",
            isActive('/ranking') ? 'text-primary scale-110' : 'text-muted-foreground'
          )}
        >
          <Trophy size={20} strokeWidth={isActive('/ranking') ? 3 : 2} />
          <span className="text-[10px] font-bold mt-1 uppercase tracking-tighter">Copa</span>
        </Link>

        {/* Vendas (BOTAO DO MEIO VERDE E MAIOR) */}
        <div className="relative -mt-10 px-2">
          <Link 
            to="/sales" 
            className="flex items-center justify-center w-16 h-16 rounded-full bg-primary text-primary-foreground border-4 border-white dark:border-slate-900 shadow-lg shadow-primary/30 transition-all hover:scale-110 active:scale-95"
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
          className={cn(
            "flex flex-col items-center justify-center flex-1 h-12 transition-all",
            isActive('/performance') ? 'text-primary scale-110' : 'text-muted-foreground'
          )}
        >
          <Activity size={20} strokeWidth={isActive('/performance') ? 3 : 2} />
          <span className="text-[10px] font-bold mt-1 uppercase tracking-tighter">Foco</span>
        </Link>

        {/* Perfil (Redirects to Settings) */}
        <Link 
          to="/settings" 
          className={cn(
            "flex flex-col items-center justify-center flex-1 h-12 transition-all",
            isActive('/settings') ? 'text-primary scale-110' : 'text-muted-foreground'
          )}
        >
          <User size={20} strokeWidth={isActive('/settings') ? 3 : 2} />
          <span className="text-[10px] font-bold mt-1 uppercase tracking-tighter">Perfil</span>
        </Link>

      </div>
    </nav>
  );
}
