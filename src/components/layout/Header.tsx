import { useAuth } from '../../hooks/useAuth';
import { useCompany } from '../../contexts/CompanyContext';
import { useTheme } from '../../contexts/ThemeContext';
import { usePermissions } from '../../hooks/usePermissions';
import { Avatar, AvatarFallback } from '../ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Search, Bell, LayoutGrid, ChevronDown, Settings as SettingsIcon, LogOut, Moon, Sun, PanelLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../integrations/supabase/client';
import { CACHE } from '../../config/constants';

export function Header({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const { user, signOut } = useAuth();
  const { company, companyId } = useCompany();
  const { role } = usePermissions();
  const { theme, toggleTheme } = useTheme();

  const { data: openAlertsCount = 0 } = useQuery<number>({
    queryKey: ['alerts-open-count', companyId],
    queryFn: async () => {
      if (!companyId) return 0;
      const { count, error } = await supabase
        .from('alerts')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('status', 'open');
      if (error) return 0;
      return count ?? 0;
    },
    enabled: !!companyId,
    staleTime: CACHE.STALE_TIME,
  });

  const roleLabels: Record<string, string> = {
    owner_admin: 'Administrador',
    agent: 'Visualizador',
  };

  return (
    <header className="shrink-0 z-30 flex h-[64px] items-center justify-between border-b border-border bg-background px-4 sm:px-5 lg:px-8">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onOpenSidebar}
          className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-muted lg:hidden"
          aria-label="Abrir menu"
        >
          <PanelLeft className="h-4.5 w-4.5" />
        </button>
        {company && (
          <span className="hidden truncate text-sm font-semibold text-muted-foreground sm:block dark:text-muted-foreground">
            {company.name}
          </span>
        )}
      </div>

      <div className="mx-3 hidden max-w-xl flex-1 md:block lg:mx-6">
        <div className="relative flex items-center">
          <Search className="absolute left-4 h-4.5 w-4.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar conversas, clientes ou atendentes"
            className="w-full rounded-full border border-border/70 bg-card/90 py-3 pl-11 pr-20 text-sm text-foreground shadow-sm transition-all placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <span className="pointer-events-none absolute right-3 flex items-center gap-0.5 rounded-full border border-border bg-background px-2 py-1 text-[10px] font-semibold text-muted-foreground shadow-sm">
            CTRL F
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <button className="hidden h-10 w-10 items-center justify-center rounded-2xl border border-transparent text-muted-foreground transition-colors hover:bg-muted dark:text-muted-foreground dark:hover:bg-accent md:flex dark:hover:text-foreground">
          <LayoutGrid className="h-4.5 w-4.5" />
        </button>

        <button
          onClick={toggleTheme}
          className="flex h-10 w-10 items-center justify-center rounded-2xl border border-transparent text-muted-foreground transition-colors hover:bg-muted dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-foreground"
          aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
          title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
        >
          {theme === 'dark' ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
        </button>

        <Link
          to="/alerts"
          className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-transparent text-muted-foreground transition-colors hover:bg-muted dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-foreground"
          title={openAlertsCount > 0 ? `${openAlertsCount} alerta${openAlertsCount !== 1 ? 's' : ''} aberto${openAlertsCount !== 1 ? 's' : ''}` : 'Alertas'}
        >
          <Bell className="h-4.5 w-4.5" />
          {openAlertsCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
              {openAlertsCount > 99 ? '99+' : openAlertsCount}
            </span>
          )}
        </Link>

        <div className="mx-1 hidden h-5 w-px bg-secondary/30 dark:bg-border sm:block" />

        <DropdownMenu>
          <DropdownMenuTrigger className="group flex items-center gap-2 rounded-full border border-border/70 bg-card/85 px-1.5 py-1.5 shadow-sm outline-none transition-colors hover:bg-muted/50 sm:gap-3 sm:px-2">
            <Avatar className="h-9 w-9 border border-border shadow-sm">
              <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
                {user?.email?.charAt(0).toUpperCase() ?? '?'}
              </AvatarFallback>
            </Avatar>
            <div className="text-left hidden sm:block">
              <p className="text-[13px] font-semibold text-foreground leading-none">
                {user?.email?.split('@')[0]}
              </p>
              {role && (
                <p className="text-[11px] text-muted-foreground leading-none mt-1">
                  {roleLabels[role] ?? role}
                </p>
              )}
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground group-aria-expanded:rotate-180 transition-transform hidden sm:block" />
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-60 rounded-xl border border-border bg-card p-1.5 shadow-xl">
            <DropdownMenuLabel className="px-3 py-2">
              <p className="text-sm font-bold leading-none text-foreground">Minha Conta</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{user?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
              <SettingsIcon className="h-4 w-4" />
              Configuracoes de Perfil
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              onSelect={signOut}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold text-red-600 outline-none transition-colors hover:bg-destructive/10 focus:bg-destructive/10 dark:text-red-400"
            >
              <LogOut className="h-4 w-4" />
              Sair da Conta
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
