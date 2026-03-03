import { Link } from 'react-router-dom';
import { CheckCircle2, ShieldCheck, TrendingUp, Zap, BarChart3, Users, Moon, Sun } from 'lucide-react';
import { Button } from '../components/ui/button';
import { useTheme } from '../contexts/ThemeContext';

const differentiators = [
  'Monitora todo atendimento e mostra gargalos de venda',
  'Feedback de IA por atendente com pontos fortes e fracos',
  'Acompanhamento de conversas quentes sem follow-up',
];

export default function MarketingLanding() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10 dark:bg-linear-to-br dark:from-[#0F282F] dark:to-[#02EFF0]/20" />
      <div className="pointer-events-none fixed inset-0 -z-10 dark:bg-[radial-gradient(circle_at_85%_5%,rgba(2,239,240,0.25),transparent_30%),radial-gradient(circle_at_10%_95%,rgba(2,239,240,0.2),transparent_30%)]" />

      <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0F282F] text-[#02EFF0] dark:bg-[#02EFF0] dark:text-[#0F282F]">
              <span className="text-sm font-black">MI</span>
            </div>
            <div className="leading-none">
              <span className="block text-xl font-bold tracking-tight">MonitoraIA</span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Performance de Atendimento</span>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted"
              aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
              title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <Button asChild variant="outline" className="rounded-full border-border bg-card">
              <Link to="/login">Login</Link>
            </Button>
            <Button asChild className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
              <Link to="/login?mode=signup">Cadastro</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-6 pb-16 pt-16">
        <section className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
              <Zap size={12} /> Plataforma para vender mais no WhatsApp
            </div>
            <h1 className="text-4xl font-black leading-tight tracking-tight md:text-6xl">
              Atendimento inteligente
              <span className="block text-primary">para aumentar conversão</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
              O MonitoraIA transforma conversas em receita com análise de IA, monitoramento de equipe e ações práticas para gestores.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="rounded-full bg-primary px-9 text-primary-foreground hover:bg-primary/90">
                <Link to="/login?mode=signup">Começar agora</Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="rounded-full border-border bg-card px-9">
                <Link to="/login">Entrar no painel</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card p-6 shadow-xl">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-muted p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Produtividade</p>
                <p className="mt-1 text-3xl font-black text-foreground">+42%</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tempo de resposta</p>
                <p className="mt-1 text-3xl font-black text-foreground">-35%</p>
              </div>
            </div>
            <div className="mt-5 rounded-2xl border border-primary/25 bg-primary/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Proposta comercial</p>
              <p className="mt-2 text-2xl font-black text-foreground">Mais conversas fechadas, menos oportunidades perdidas.</p>
            </div>
          </div>
        </section>

        <section className="mt-14 grid gap-4 md:grid-cols-3">
          {differentiators.map((text) => (
            <article key={text} className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-primary">
                <CheckCircle2 size={18} />
              </div>
              <p className="text-sm leading-relaxed text-foreground">{text}</p>
            </article>
          ))}
        </section>

        <section className="mt-14 rounded-3xl border border-border bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-2xl font-black tracking-tight">Visão executiva com IA</h2>
            <Button asChild className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
              <Link to="/login?mode=signup">Criar conta</Link>
            </Button>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-border bg-muted p-4">
              <TrendingUp className="mb-2 h-5 w-5 text-primary" />
              <p className="text-sm font-semibold">Ranking de atendentes</p>
              <p className="mt-1 text-xs text-muted-foreground">Acompanhe qualidade e consistência da operação.</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted p-4">
              <BarChart3 className="mb-2 h-5 w-5 text-primary" />
              <p className="text-sm font-semibold">Insights acionáveis</p>
              <p className="mt-1 text-xs text-muted-foreground">Transforme dados de conversa em plano de ação objetivo.</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted p-4">
              <ShieldCheck className="mb-2 h-5 w-5 text-primary" />
              <p className="text-sm font-semibold">Gestão por evidências</p>
              <p className="mt-1 text-xs text-muted-foreground">Feedback com snippets reais e recomendações práticas.</p>
            </div>
          </div>
        </section>

        <footer className="mt-12 border-t border-border py-8 text-xs text-muted-foreground">
          <div className="flex flex-col items-center justify-between gap-3 md:flex-row">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span>MonitoraIA - Atendimento que gera receita</span>
            </div>
            <span>&copy; 2026 MonitoraIA</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
