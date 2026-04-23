import { Suspense, lazy, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { env } from './config/env';
import { useAuth } from './hooks/useAuth';
import { CompanyProvider, useCompany } from './contexts/CompanyContext';
import { MainLayout } from './components/layout/MainLayout';
import { PermissionGate } from './components/auth/PermissionGate';

import Login from './pages/Login';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const AgentDashboard = lazy(() => import('./pages/AgentDashboard'));
const Agents = lazy(() => import('./pages/Agents'));
const AgentDetail = lazy(() => import('./pages/AgentDetail'));
const Conversations = lazy(() => import('./pages/Conversations'));
const ConversationDetail = lazy(() => import('./pages/ConversationDetail'));
const Sales = lazy(() => import('./pages/Sales'));
const Playbooks = lazy(() => import('./pages/Playbooks'));
const Settings = lazy(() => import('./pages/Settings'));
const KnowledgeBase = lazy(() => import('./pages/KnowledgeBase'));
const RegisterBusiness = lazy(() => import('./pages/RegisterBusiness'));
const MarketingLanding = lazy(() => import('./pages/MarketingLanding'));
const Ranking = lazy(() => import('./pages/Ranking'));
const Relatorio = lazy(() => import('./pages/Relatorio'));
const Coach = lazy(() => import('./pages/Coach'));
const Templates = lazy(() => import('./pages/Templates'));
const AIInsights = lazy(() => import('./pages/AIInsights'));
const ProductIntelligence = lazy(() => import('./pages/ProductIntelligence'));
const CustomerIntelligence = lazy(() => import('./pages/CustomerIntelligence'));

function RouteLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

function LazyPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteLoading />}>{children}</Suspense>;
}

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

function RootDashboard() {
  const { role, isLoading } = useCompany();
  if (isLoading) {
    return <RouteLoading />;
  }
  if (role === 'agent') {
    return (
      <LazyPage>
        <AgentDashboard />
      </LazyPage>
    );
  }
  return (
    <LazyPage>
      <Dashboard />
    </LazyPage>
  );
}

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
      return (
        <LazyPage>
          <MarketingLanding />
        </LazyPage>
      );
    }
    const redirect = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirect)}`} replace />;
  }

  return (
    <CompanyProvider>
      <Routes>
        <Route element={<MainLayout />}>
          <Route index element={<RootDashboard />} />
          <Route
            path="coach"
            element={
              <PermissionGate permission="dashboard.view" fallback={<Navigate to="/" replace />}>
                <LazyPage>
                  <Coach />
                </LazyPage>
              </PermissionGate>
            }
          />
          <Route
            path="templates"
            element={
              <PermissionGate permission="dashboard.view" fallback={<Navigate to="/" replace />}>
                <LazyPage>
                  <Templates />
                </LazyPage>
              </PermissionGate>
            }
          />
          <Route
            path="agents"
            element={
              <PermissionGate permission="agents.view_team" fallback={<Navigate to="/" replace />}>
                <LazyPage>
                  <Agents />
                </LazyPage>
              </PermissionGate>
            }
          />
          <Route
            path="agents/:id"
            element={
              <PermissionGate permission="agents.view_team" fallback={<Navigate to="/" replace />}>
                <LazyPage>
                  <AgentDetail />
                </LazyPage>
              </PermissionGate>
            }
          />
          <Route
            path="conversations"
            element={
              <PermissionGate permission="conversations.view_own" fallback={<Navigate to="/" replace />}>
                <LazyPage>
                  <Conversations />
                </LazyPage>
              </PermissionGate>
            }
          />
          <Route
            path="ranking"
            element={
              <PermissionGate permission="performance.view" fallback={<Navigate to="/" replace />}>
                <LazyPage>
                  <Ranking />
                </LazyPage>
              </PermissionGate>
            }
          />
          <Route
            path="conversations/:id"
            element={
              <PermissionGate permission="conversations.view_own" fallback={<Navigate to="/" replace />}>
                <LazyPage>
                  <ConversationDetail />
                </LazyPage>
              </PermissionGate>
            }
          />
          <Route path="alerts" element={<Navigate to="/ai-insights" replace />} />
          <Route path="audit" element={<Navigate to="/relatorio?tab=auditoria" replace />} />
          <Route
            path="ai-insights"
            element={
              <PermissionGate permission="audit.view" fallback={<Navigate to="/" replace />}>
                <LazyPage>
                  <AIInsights />
                </LazyPage>
              </PermissionGate>
            }
          />
          <Route
            path="relatorio"
            element={
              <PermissionGate permission="audit.view" fallback={<Navigate to="/" replace />}>
                <LazyPage>
                  <Relatorio />
                </LazyPage>
              </PermissionGate>
            }
          />
          <Route
            path="sales"
            element={
              <PermissionGate permission="revenue.view_own" fallback={<Navigate to="/" replace />}>
                <LazyPage>
                  <Sales />
                </LazyPage>
              </PermissionGate>
            }
          />
          <Route path="revenue-insights" element={<Navigate to="/relatorio?tab=revenue" replace />} />
          <Route path="performance" element={<Navigate to="/relatorio?tab=performance" replace />} />
          <Route
            path="playbooks"
            element={
              <PermissionGate permission="playbooks.view" fallback={<Navigate to="/" replace />}>
                <LazyPage>
                  <Playbooks />
                </LazyPage>
              </PermissionGate>
            }
          />
          <Route
            path="knowledge-base"
            element={
              <PermissionGate permission="settings.company" fallback={<Navigate to="/" replace />}>
                <LazyPage>
                  <KnowledgeBase />
                </LazyPage>
              </PermissionGate>
            }
          />
          <Route
            path="settings"
            element={
              <PermissionGate permission="settings.company" fallback={<Navigate to="/" replace />}>
                <LazyPage>
                  <Settings />
                </LazyPage>
              </PermissionGate>
            }
          />
          <Route
            path="customer-intelligence"
            element={
              <PermissionGate permission="audit.view" fallback={<Navigate to="/" replace />}>
                <LazyPage>
                  <CustomerIntelligence />
                </LazyPage>
              </PermissionGate>
            }
          />
          <Route
            path="product-intelligence"
            element={
              <PermissionGate permission="audit.view" fallback={<Navigate to="/" replace />}>
                <LazyPage>
                  <ProductIntelligence />
                </LazyPage>
              </PermissionGate>
            }
          />
          <Route
            path="register-business"
            element={(
              <LazyPage>
                <RegisterBusiness />
              </LazyPage>
            )}
          />
        </Route>
      </Routes>
    </CompanyProvider>
  );
}

function AuthRoute() {
  const { user, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  if (user) return <Navigate to={redirectTo} replace />;

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
