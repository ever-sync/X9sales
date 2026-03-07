import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { env } from './config/env';
import { useAuth } from './hooks/useAuth';
import { CompanyProvider } from './contexts/CompanyContext';
import { MainLayout } from './components/layout/MainLayout';
import { PermissionGate } from './components/auth/PermissionGate';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Agents from './pages/Agents';
import AgentDetail from './pages/AgentDetail';
import Conversations from './pages/Conversations';
import ConversationDetail from './pages/ConversationDetail';
import Alerts from './pages/Alerts';
import Audit from './pages/Audit';
import AIInsights from './pages/AIInsights';
import RevenueInsights from './pages/RevenueInsights';
import Playbooks from './pages/Playbooks';
import Settings from './pages/Settings';
import KnowledgeBase from './pages/KnowledgeBase';
import RegisterBusiness from './pages/RegisterBusiness';
import MarketingLanding from './pages/MarketingLanding';
import Ranking from './pages/Ranking';
import CustomerIntelligence from './pages/CustomerIntelligence';
import ProductIntelligence from './pages/ProductIntelligence';

function SetupScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted">
      <div className="w-full max-w-lg">
        <div className="bg-card rounded-2xl shadow-sm border border-border p-8">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-primary">MonitoraIA</h1>
            <p className="text-muted-foreground mt-2">Plataforma de monitoramento de atendimento</p>
          </div>

          <div className="bg-accent border border-primary/30 rounded-xl p-4 mb-6">
            <h2 className="text-sm font-semibold text-primary mb-1">Configuracao necessaria</h2>
            <p className="text-sm text-primary">
              Crie um arquivo <code className="bg-accent px-1 rounded">.env</code> na raiz do projeto com as credenciais do Supabase:
            </p>
          </div>

          <div className="bg-card rounded-xl p-4 font-mono text-sm text-muted-foreground overflow-x-auto">
            <div><span className="text-primary">VITE_SUPABASE_URL</span>=https://seu-projeto.supabase.co</div>
            <div><span className="text-primary">VITE_SUPABASE_ANON_KEY</span>=sua-anon-key-aqui</div>
          </div>

          <div className="mt-6 space-y-3 text-sm text-muted-foreground">
            <p><strong>1.</strong> Crie um projeto no <a href="https://supabase.com" target="_blank" rel="noopener" className="text-primary hover:underline">supabase.com</a></p>
            <p><strong>2.</strong> Copie a URL e a anon key das configuracoes do projeto</p>
            <p><strong>3.</strong> Crie o arquivo <code className="bg-muted px-1 rounded">.env</code> (use <code className="bg-muted px-1 rounded">.env.example</code> como modelo)</p>
            <p><strong>4.</strong> Reinicie o servidor de desenvolvimento</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoutes() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    if (location.pathname === '/') {
      return <MarketingLanding />;
    }
    return <Navigate to="/" replace />;
  }

  return (
    <CompanyProvider>
      <Routes>
        <Route element={<MainLayout />}>
          <Route index element={<Dashboard />} />
          <Route
            path="agents"
            element={
              <PermissionGate permission="agents.view_team" fallback={<Navigate to="/" replace />}>
                <Agents />
              </PermissionGate>
            }
          />
          <Route
            path="agents/:id"
            element={
              <PermissionGate permission="agents.view_team" fallback={<Navigate to="/" replace />}>
                <AgentDetail />
              </PermissionGate>
            }
          />
          <Route
            path="conversations"
            element={
              <PermissionGate permission="conversations.view_own" fallback={<Navigate to="/" replace />}>
                <Conversations />
              </PermissionGate>
            }
          />
          <Route
            path="ranking"
            element={
              <PermissionGate permission="agents.view_team" fallback={<Navigate to="/" replace />}>
                <Ranking />
              </PermissionGate>
            }
          />
          <Route
            path="conversations/:id"
            element={
              <PermissionGate permission="conversations.view_own" fallback={<Navigate to="/" replace />}>
                <ConversationDetail />
              </PermissionGate>
            }
          />
          <Route
            path="alerts"
            element={
              <PermissionGate permission="alerts.view" fallback={<Navigate to="/" replace />}>
                <Alerts />
              </PermissionGate>
            }
          />
          <Route
            path="audit"
            element={
              <PermissionGate permission="audit.view" fallback={<Navigate to="/" replace />}>
                <Audit />
              </PermissionGate>
            }
          />
          <Route
            path="ai-insights"
            element={
              <PermissionGate permission="audit.review" fallback={<Navigate to="/" replace />}>
                <AIInsights />
              </PermissionGate>
            }
          />
          <Route
            path="revenue-insights"
            element={
              <PermissionGate permission="revenue.view" fallback={<Navigate to="/" replace />}>
                <RevenueInsights />
              </PermissionGate>
            }
          />
          <Route
            path="playbooks"
            element={
              <PermissionGate permission="playbooks.view" fallback={<Navigate to="/" replace />}>
                <Playbooks />
              </PermissionGate>
            }
          />
          <Route
            path="knowledge-base"
            element={
              <PermissionGate permission="settings.company" fallback={<Navigate to="/" replace />}>
                <KnowledgeBase />
              </PermissionGate>
            }
          />
          <Route
            path="settings"
            element={
              <PermissionGate permission="settings.company" fallback={<Navigate to="/" replace />}>
                <Settings />
              </PermissionGate>
            }
          />
          <Route
            path="customer-intelligence"
            element={
              <PermissionGate permission="revenue.view" fallback={<Navigate to="/" replace />}>
                <CustomerIntelligence />
              </PermissionGate>
            }
          />
          <Route
            path="product-intelligence"
            element={
              <PermissionGate permission="revenue.view" fallback={<Navigate to="/" replace />}>
                <ProductIntelligence />
              </PermissionGate>
            }
          />
          <Route path="register-business" element={<RegisterBusiness />} />
        </Route>
      </Routes>
    </CompanyProvider>
  );
}

function AuthRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;

  return <Login />;
}

export default function App() {
  return (
    !env.isConfigured ? (
      <SetupScreen />
    ) : (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<AuthRoute />} />
            <Route path="/*" element={<ProtectedRoutes />} />
          </Routes>
        </BrowserRouter>
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    )
  );
}
