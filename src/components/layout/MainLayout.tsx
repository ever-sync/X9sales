import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { ManagerCopilotWidget } from '../copilot/ManagerCopilotWidget';
import { useCompany } from '../../contexts/CompanyContext';

export function MainLayout() {
  const { companies, isLoading } = useCompany();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar-collapsed') === 'true',
  );

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

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
    <div className="flex h-screen overflow-hidden bg-background dark:bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} collapsed={collapsed} onToggleCollapse={toggleCollapse} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header onOpenSidebar={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto px-4 py-4 text-foreground sm:px-5 lg:px-8 lg:py-6 dark:text-foreground pb-32 md:pb-6">
          <div className="mx-auto w-full max-w-[1600px]">
            <Outlet />
          </div>
        </main>
      </div>
      <BottomNav />
      <ManagerCopilotWidget />
    </div>
  );
}
