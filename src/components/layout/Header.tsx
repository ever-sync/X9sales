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
import { Search, Bell, LayoutGrid, ChevronDown, Settings as SettingsIcon, LogOut, Moon, Sun } from 'lucide-react';

export function Header() {
  const { user, signOut } = useAuth();
  const { company } = useCompany();
  const { role } = usePermissions();
  const { theme, toggleTheme } = useTheme();

  const roleLabels: Record<string, string> = {
    owner_admin: 'Administrador',
    manager: 'Gerente',
    qa_reviewer: 'Revisor QA',
    agent: 'Atendente',
  };

  return (
    <header className="h-16 bg-card dark:bg-card border-b border-border dark:border-border flex items-center justify-between px-6 sticky top-0 z-30">
      <div className="flex items-center gap-2 min-w-0">
        {company && (
          <span className="text-sm font-semibold text-muted-foreground dark:text-muted-foreground truncate hidden sm:block">
            {company.name}
          </span>
        )}
      </div>

      <div className="flex-1 max-w-sm mx-6">
        <div className="relative flex items-center">
          <Search className="absolute left-3 h-4 w-4 text-muted-foreground dark:text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar..."
            className="w-full pl-9 pr-16 py-2 text-sm bg-muted dark:bg-secondary border border-border dark:border-border rounded-lg text-foreground dark:text-foreground placeholder-muted-foreground dark:placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary transition-all"
          />
          <span className="absolute right-3 flex items-center gap-0.5 text-[10px] font-semibold text-muted-foreground dark:text-muted-foreground bg-secondary dark:bg-secondary/80 px-1.5 py-0.5 rounded pointer-events-none">
            CTRL F
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground dark:text-muted-foreground hover:bg-muted dark:hover:bg-secondary hover:text-muted-foreground dark:hover:text-muted-foreground transition-colors">
          <LayoutGrid className="h-4.5 w-4.5" />
        </button>

        <button
          onClick={toggleTheme}
          className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground dark:text-muted-foreground hover:bg-muted dark:hover:bg-secondary hover:text-muted-foreground dark:hover:text-muted-foreground transition-colors"
          aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
          title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
        >
          {theme === 'dark' ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
        </button>

        <button className="relative h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground dark:text-muted-foreground hover:bg-muted dark:hover:bg-secondary hover:text-muted-foreground dark:hover:text-muted-foreground transition-colors">
          <Bell className="h-4.5 w-4.5" />
          <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-red-500 rounded-full" />
        </button>

        <div className="w-px h-5 bg-secondary dark:bg-secondary/80 mx-1" />

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-muted dark:hover:bg-secondary transition-colors outline-none group">
            <Avatar className="h-8 w-8 border border-border dark:border-border">
              <AvatarFallback className="bg-linear-to-br from-[#0F282F] to-primary text-white font-bold text-xs">
                {user?.email?.charAt(0).toUpperCase() ?? '?'}
              </AvatarFallback>
            </Avatar>
            <div className="text-left hidden sm:block">
              <p className="text-[13px] font-semibold text-foreground dark:text-foreground leading-none">
                {user?.email?.split('@')[0]}
              </p>
              {role && (
                <p className="text-[11px] text-muted-foreground dark:text-muted-foreground leading-none mt-0.5">
                  {roleLabels[role] ?? role}
                </p>
              )}
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground dark:text-muted-foreground group-aria-expanded:rotate-180 transition-transform hidden sm:block" />
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-60 p-1.5 rounded-xl border-border dark:border-border shadow-xl bg-card dark:bg-card">
            <DropdownMenuLabel className="px-3 py-2">
              <p className="text-sm font-bold text-foreground dark:text-foreground leading-none">Minha Conta</p>
              <p className="text-xs text-muted-foreground dark:text-muted-foreground truncate mt-1">{user?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-muted dark:bg-secondary" />
            <DropdownMenuItem className="flex items-center gap-2 px-3 py-2 rounded-lg text-muted-foreground dark:text-muted-foreground hover:bg-muted dark:hover:bg-secondary text-[13px] font-medium cursor-pointer">
              <SettingsIcon className="h-4 w-4" />
              Configuracoes de Perfil
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-muted dark:bg-secondary" />
            <DropdownMenuItem
              onSelect={signOut}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-destructive/10 text-[13px] font-semibold cursor-pointer outline-none transition-colors focus:bg-red-50 dark:focus:bg-destructive/10"
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
