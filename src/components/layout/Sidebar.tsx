import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  AlertTriangle,
  ClipboardCheck,
  Settings,
  Brain,
  BookOpen,
  HandCoins,
  BookCheck,
  ChevronsUpDown,
  Building2,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { useCompany } from '../../contexts/CompanyContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { cn } from '../../lib/utils';

type NavGroup = {
  label: string;
  items: Array<{
    to: string;
    icon: React.ElementType;
    label: string;
    permission: Parameters<ReturnType<typeof usePermissions>['can']>[0];
    badge?: string;
  }>;
};

const navGroups: NavGroup[] = [
  {
    label: 'PRINCIPAL',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard', permission: 'dashboard.view' },
      { to: '/conversations', icon: MessageSquare, label: 'Conversas', permission: 'conversations.view_own' },
      { to: '/alerts', icon: AlertTriangle, label: 'Alertas', permission: 'alerts.view' },
    ],
  },
  {
    label: 'GESTAO',
    items: [
      { to: '/agents', icon: Users, label: 'Atendentes', permission: 'agents.view_team' },
      { to: '/audit', icon: ClipboardCheck, label: 'Auditoria', permission: 'audit.view' },
      { to: '/ai-insights', icon: Brain, label: 'Analise IA', permission: 'dashboard.view', badge: 'IA' },
      { to: '/revenue-insights', icon: HandCoins, label: 'Revenue Insights', permission: 'revenue.view', badge: 'ROI' },
    ],
  },
  {
    label: 'CONFIGURACAO',
    items: [
      { to: '/playbooks', icon: BookCheck, label: 'Playbooks', permission: 'playbooks.view' },
      { to: '/knowledge-base', icon: BookOpen, label: 'Base de Conhecimento', permission: 'settings.company' },
      { to: '/settings', icon: Settings, label: 'Configuracoes', permission: 'settings.company' },
    ],
  },
];

export function Sidebar() {
  const { can } = usePermissions();
  const { company, companies, setCompanyId } = useCompany();
  const { user } = useAuth();

  return (
    <aside className="flex h-screen w-[230px] flex-col border-r border-border dark:border-border bg-card dark:bg-card">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <Brain className="h-4 w-4 text-white" />
        </div>
        <span className="text-[15px] font-bold tracking-tight text-foreground dark:text-foreground">MonitoraIA</span>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-2">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter((item) => can(item.permission));
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.label}>
              <p className="mb-1.5 px-3 text-[10px] font-bold tracking-widest text-muted-foreground">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {visibleItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-150',
                        isActive
                          ? 'bg-accent dark:bg-accent font-semibold text-primary dark:text-primary'
                          : 'text-muted-foreground dark:text-muted-foreground hover:bg-muted dark:hover:bg-secondary hover:text-foreground',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
                        )}
                        <item.icon
                          className={cn(
                            'h-4 w-4 shrink-0 transition-colors',
                            isActive ? 'text-primary dark:text-primary' : 'text-muted-foreground dark:text-muted-foreground group-hover:text-muted-foreground dark:group-hover:text-muted-foreground',
                          )}
                        />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge && (
                          <span className="rounded bg-accent px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-primary">
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-border dark:border-border px-3 pb-4 pt-2">
        {companies.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="group flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 transition-colors outline-none hover:bg-muted dark:hover:bg-secondary">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent">
                <Building2 className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="mb-0.5 text-[10px] font-bold uppercase leading-none tracking-widest text-muted-foreground">
                  Empresa
                </p>
                <p className="truncate text-[13px] font-semibold leading-none text-foreground dark:text-foreground">
                  {company?.name ?? '--'}
                </p>
              </div>
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground dark:text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="start"
              className="mb-1 w-52 rounded-xl border-border dark:border-border bg-card dark:bg-card p-1.5 shadow-xl"
            >
              <DropdownMenuLabel className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Alternar Empresa
              </DropdownMenuLabel>
              {companies.map((currentCompany) => (
                <DropdownMenuItem
                  key={currentCompany.id}
                  onSelect={() => setCompanyId(currentCompany.id)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-[13px] outline-none transition-colors',
                    currentCompany.id === company?.id
                      ? 'bg-accent dark:bg-accent font-semibold text-primary dark:text-primary'
                      : 'text-muted-foreground dark:text-muted-foreground hover:bg-muted dark:hover:bg-secondary hover:text-foreground focus:bg-muted dark:focus:bg-secondary',
                  )}
                >
                  <Building2 className="h-3.5 w-3.5 shrink-0" />
                  {currentCompany.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex items-center gap-2.5 rounded-lg px-3 py-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent">
              <Building2 className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="mb-0.5 text-[10px] font-bold uppercase leading-none tracking-widest text-muted-foreground">
                Empresa
              </p>
              <p className="truncate text-[13px] font-semibold leading-none text-foreground dark:text-foreground">
                {company?.name ?? user?.email?.split('@')[0] ?? '--'}
              </p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
