import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { ManagerCopilotWidget } from '../copilot/ManagerCopilotWidget';
import { CriticalAlertNotifier } from './CriticalAlertNotifier';
import { useCompany } from '../../contexts/CompanyContext';

export function MainLayout() {
  const { companies, isLoading } = useCompany();
  const location = useLocation();
  const [sidebarState, setSidebarState] = useState<{ isOpen: boolean; pathname: string }>({
    isOpen: false,
    pathname: location.pathname,
  });
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar-collapsed') === 'true',
  );
  const sidebarOpen = sidebarState.isOpen && sidebarState.pathname === location.pathname;

  function toggleCollapse() {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  }

  if (isLoading) {
    return (
      <div className="flex h-screen bg-background dark:bg-background items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const isRegistering = location.pathname === '/register-business';

  if (isRegistering && companies.length > 0) {
    return <Navigate to="/" replace />;
  }

  if (isRegistering) {
    return <Outlet />;
  }

  if (companies.length === 0) {
    return <Navigate to="/register-business" replace />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarState({ isOpen: false, pathname: location.pathname })}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header onOpenSidebar={() => setSidebarState({ isOpen: true, pathname: location.pathname })} />
        <main className="flex-1 overflow-y-auto px-4 py-4 text-foreground sm:px-5 lg:px-8 lg:py-6 pb-32 md:pb-6">
          <div className="mx-auto w-full max-w-[1600px]">
            <Outlet />
          </div>
        </main>
      </div>
      <BottomNav />
      <ManagerCopilotWidget />
      <CriticalAlertNotifier />
    </div>
  );
}
