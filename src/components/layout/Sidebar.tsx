import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Sparkles,
  Users,
  MessageSquare,
  Settings,
  BookOpen,
  HandCoins,
  BookCheck,
  ChevronsUpDown,
  Building2,
  Trophy,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Brain,
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
import siteLogo from '../../../img-site/Group 128.svg';
import collapsedLogo from '../../../img-site/Group 122.svg';

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
      { to: '/coach', icon: Sparkles, label: 'Coach', permission: 'dashboard.view' },
      { to: '/sales', icon: HandCoins, label: 'Vendas', permission: 'revenue.view_own' },
      { to: '/ranking', icon: Trophy, label: 'Ranking', permission: 'performance.view' },
      { to: '/conversations', icon: MessageSquare, label: 'Conversas', permission: 'conversations.view_own' },
    ],
  },
  {
    label: 'GESTAO',
    items: [
      { to: '/agents', icon: Users, label: 'Atendentes', permission: 'agents.view_team' },
      { to: '/relatorio?tab=ai', icon: Brain, label: 'IA analise', permission: 'audit.view' },
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

export function Sidebar({
  isOpen,
  onClose,
  collapsed,
  onToggleCollapse,
}: {
  isOpen: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const { can } = usePermissions();
  const { company, companies, setCompanyId, role } = useCompany();
  const { user } = useAuth();
  
  const isAgent = role === 'agent';

  return (
    <>
      {/* mobile overlay */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm transition-opacity lg:hidden',
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
      />

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-screen flex-col border-r border-white/6 bg-black text-white shadow-[0_24px_80px_rgba(0,0,0,0.35)] transition-all duration-300 lg:static lg:z-auto lg:shadow-none lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          collapsed ? 'w-[68px]' : 'w-[272px]',
        )}
      >
        {/* header: logo + close/collapse */}
        <div className={cn(
          'flex border-b border-white/6 px-4 py-5',
          collapsed ? 'flex-col items-center gap-3' : 'items-center justify-between gap-3',
        )}>
          <img
            src={collapsed ? collapsedLogo : siteLogo}
            alt="Logo"
            className={cn(
              'w-auto object-contain',
              collapsed ? 'h-10' : 'h-12',
            )}
          />

          {/* mobile close — only on small screens */}
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 text-white/60 transition-colors hover:bg-white/5 hover:text-white lg:hidden"
            aria-label="Fechar menu"
          >
            <X className="h-4.5 w-4.5" />
          </button>

          {/* collapse toggle — desktop only */}
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden h-9 w-9 items-center justify-center rounded-2xl border border-white/10 text-white/60 transition-colors hover:bg-white/5 hover:text-white lg:flex"
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed
              ? <PanelLeftOpen className="h-4 w-4" />
              : <PanelLeftClose className="h-4 w-4" />
            }
          </button>
        </div>

        {/* nav */}
        <nav className={cn('no-scrollbar flex-1 space-y-5 overflow-y-auto py-5', collapsed ? 'px-2' : 'px-4')}>
          {navGroups.map((group) => {
            const visibleItems = group.items.filter((item) => can(item.permission));
            if (visibleItems.length === 0) return null;

            return (
              <div key={group.label}>
                {!collapsed && (
                  <p className="mb-2 px-4 text-[10px] font-semibold tracking-[0.24em] text-white/35 uppercase">
                    {group.label}
                  </p>
                )}
                {collapsed && <div className="my-1 h-px bg-white/8" />}
                <div className="space-y-1">
                  {visibleItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        cn(
                          'group relative flex items-center rounded-2xl transition-all duration-200 border',
                          collapsed ? 'justify-center px-0 py-3' : 'gap-3 px-4 py-3 text-[14px] font-medium',
                          isActive
                            ? 'border-primary/30 bg-primary text-primary-foreground font-bold shadow-[0_12px_30px_rgba(220,254,27,0.18)]'
                            : 'border-transparent text-white/65 hover:border-white/10 hover:text-white hover:bg-white/5',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {!collapsed && (
                            <span
                              className={cn(
                                'absolute left-1 top-1/2 h-8 w-1 -translate-y-1/2 rounded-full transition-all',
                                isActive ? 'bg-black/70 opacity-100' : 'opacity-0',
                              )}
                            />
                          )}
                          <item.icon
                            className={cn(
                              'shrink-0 transition-colors',
                              collapsed ? 'h-5 w-5' : 'h-5 w-5',
                              isActive ? 'text-black' : 'text-white/45 group-hover:text-white',
                            )}
                          />
                          {!collapsed && (
                            <>
                              <span className="flex-1 truncate">
                                {isAgent && item.label === 'Dashboard' ? 'Meu Painel' : 
                                 isAgent && item.label === 'Conversas' ? 'Minhas Conversas' : 
                                 isAgent && item.label === 'Alertas' ? 'Meus Alertas' : 
                                 isAgent && item.label === 'Vendas' ? 'Minhas Vendas' : 
                                 item.label}
                              </span>
                              {item.badge && (
                                <span className={cn(
                                  'ml-auto flex items-center justify-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                                  isActive ? 'bg-black/15 text-black' : 'bg-primary/15 text-primary',
                                )}>
                                  {item.badge}
                                </span>
                              )}
                            </>
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

        {/* footer: company */}
        <div className={cn('border-t border-white/6 p-3', collapsed && 'flex justify-center')}>
          {collapsed ? (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10" title={company?.name ?? ''}>
              <Building2 className="h-5 w-5 text-primary" />
            </div>
          ) : companies.length > 1 ? (
            <DropdownMenu>
            <DropdownMenuTrigger className="group flex w-full items-center gap-3 rounded-2xl border border-white/8 bg-white/4 p-2.5 transition-colors outline-none hover:bg-white/6">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-semibold text-white group-hover:text-primary transition-colors">
                    {company?.name ?? '--'}
                  </p>
                  <p className="text-xs text-white/40">Alternar empresa</p>
                </div>
                <ChevronsUpDown className="mr-1 h-4 w-4 shrink-0 text-white/30 group-hover:text-white transition-colors" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="start"
                className="mb-2 w-[220px] rounded-xl border-border bg-card shadow-lg"
              >
                <DropdownMenuLabel className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#7A7972]">
                  Alternar Empresa
                </DropdownMenuLabel>
                {companies.map((currentCompany) => (
                  <DropdownMenuItem
                    key={currentCompany.id}
                    onSelect={() => setCompanyId(currentCompany.id)}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-[13px] outline-none transition-colors',
                      currentCompany.id === company?.id
                        ? 'font-semibold text-[#171717]'
                        : 'text-[#4D4C46] hover:text-[#171717] focus:text-[#171717]',
                    )}
                    style={{
                      background: currentCompany.id === company?.id ? '#D3FE18' : 'transparent',
                    }}
                  >
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    {currentCompany.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-white/8 bg-white/4 p-2.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">
                  {company?.name ?? user?.email?.split('@')[0] ?? '--'}
                </p>
                <p className="text-[11px] font-medium text-white/40">Workspace</p>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
