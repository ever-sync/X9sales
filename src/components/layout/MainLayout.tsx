import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ManagerCopilotWidget } from '../copilot/ManagerCopilotWidget';
import { useCompany } from '../../contexts/CompanyContext';

export function MainLayout() {
  const { companies, isLoading } = useCompany();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen bg-muted dark:bg-[#0F282F] items-center justify-center">
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
    <div className="flex h-screen bg-background dark:bg-[#0F282F]">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6 text-foreground dark:text-foreground">
          <Outlet />
        </main>
      </div>
      <ManagerCopilotWidget />
    </div>
  );
}
