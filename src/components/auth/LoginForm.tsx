import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Brain, Eye, EyeOff, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

type Mode = 'login' | 'signup';

interface LoginFormProps {
  initialMode?: Mode;
}

export function LoginForm({ initialMode = 'login' }: LoginFormProps) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    setMode(initialMode);
    setError(null);
    setSuccess(null);
    setPassword('');
    setConfirmPassword('');
  }, [initialMode]);

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setError(null);
    setSuccess(null);
    setPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (mode === 'signup' && password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const { error: signInError } = await signIn(email, password);
        if (signInError) {
          setError('E-mail ou senha inválidos. Por favor, tente novamente.');
        }
      } else {
        const { error: signUpError } = await signUp(email, password);
        if (signUpError) {
          setError(signUpError.message || 'Erro ao criar conta.');
        } else {
          setSuccess('Conta criada! Verifique seu e-mail para confirmar o cadastro, depois faça login.');
        }
      }
    } catch {
      setError('Ocorreu um erro. Verifique sua conexão.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background font-sans antialiased overflow-hidden">
      {/* Visual Side */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden bg-[#0F282F]">
        <div className="absolute inset-0 z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/20 blur-[120px] rounded-full animate-pulse" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-primary/10 blur-[120px] rounded-full animate-pulse delay-700" />
        </div>

        <div className="relative z-10 flex items-center gap-2 text-white/90">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/20">
            <Brain className="h-6 w-6 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">MonitoraIA.</span>
        </div>

        <div className="relative z-10 space-y-6">
          <h2 className="text-5xl font-extrabold tracking-tight text-white leading-[1.1]">
            A inteligência que seu <br />
            <span className="text-transparent bg-clip-text bg-linear-to-r from-primary to-primary/70">
              time de atendimento
            </span> <br />
            precisava.
          </h2>
          <p className="max-w-[440px] text-lg text-muted-foreground leading-relaxed font-light">
            Monitore KPIs em tempo real, use IA para analisar sentimentos e reduza drasticamente o tempo de resposta do seu suporte.
          </p>

          <div className="flex items-center gap-8 pt-4">
            <div className="space-y-1">
              <p className="text-white font-bold text-2xl">98%</p>
              <p className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">SLA de Precisão</p>
            </div>
            <div className="w-px h-10 bg-secondary" />
            <div className="space-y-1">
              <p className="text-white font-bold text-2xl">+45%</p>
              <p className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Produtividade</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-4 text-xs text-muted-foreground/60 font-medium">
          <span>&copy; 2026 MonitoraIA Tech.</span>
          <div className="h-1 w-1 rounded-full bg-secondary/80" />
          <span>Privacidade</span>
          <div className="h-1 w-1 rounded-full bg-secondary/80" />
          <span>Termos</span>
        </div>
      </div>

      {/* Form Side */}
      <div className="flex items-center justify-center p-6 lg:p-12 bg-muted/50">
        <div className="w-full max-w-[420px] space-y-8">
          <div className="flex lg:hidden flex-col items-center gap-4 mb-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary shadow-xl shadow-primary/30">
              <Brain className="h-7 w-7 text-white" />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold text-foreground">MonitoraIA</h1>
              <p className="text-sm text-muted-foreground">Dashboard de Atendimento Inteligente</p>
            </div>
          </div>

          {/* Mode Toggle */}
          <div className="flex rounded-xl bg-muted p-1 gap-1">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={cn(
                'flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all',
                mode === 'login'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className={cn(
                'flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all',
                mode === 'signup'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Cadastro
            </button>
          </div>

          <div className="space-y-2 lg:text-left text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
              {mode === 'login' ? 'Seja bem-vindo de volta.' : 'Crie sua conta.'}
            </h1>
            <p className="text-muted-foreground font-medium leading-relaxed">
              {mode === 'login'
                ? 'Entre com suas credenciais para gerenciar sua operação.'
                : 'Preencha os dados abaixo para começar a usar o MonitoraIA.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50/80 border border-red-100 text-red-600 text-sm rounded-xl p-4 flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-red-600 shrink-0" />
                {error}
              </div>
            )}
            {success && (
              <div className="bg-accent/80 border border-primary/25 text-primary text-sm rounded-xl p-4 flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
                {success}
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-2 group">
                <label htmlFor="email" className="text-sm font-semibold text-foreground transition-colors group-focus-within:text-primary">
                  E-mail corporativo
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="voce@empresa.com"
                  className="h-12 px-4 rounded-xl border-border focus:border-primary focus:ring-4 focus:ring-ring/20 transition-all outline-none text-foreground bg-card"
                />
              </div>

              <div className="space-y-2 group">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="text-sm font-semibold text-foreground transition-colors group-focus-within:text-primary">
                    Senha
                  </label>
                  {mode === 'login' && (
                    <button type="button" className="text-xs font-semibold text-primary hover:text-primary transition-colors">
                      Esqueceu a senha?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    placeholder="••••••"
                    className="h-12 px-4 pr-12 rounded-xl border-border focus:border-primary focus:ring-4 focus:ring-ring/20 transition-all outline-none text-foreground bg-card"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {mode === 'signup' && (
                <div className="space-y-2 group">
                  <label htmlFor="confirmPassword" className="text-sm font-semibold text-foreground transition-colors group-focus-within:text-primary">
                    Confirmar senha
                  </label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                    placeholder="••••••"
                    className="h-12 px-4 rounded-xl border-border focus:border-primary focus:ring-4 focus:ring-ring/20 transition-all outline-none text-foreground bg-card"
                  />
                </div>
              )}
            </div>

            <Button
              type="submit"
              disabled={loading}
              className={cn(
                'w-full h-12 rounded-xl text-md font-bold transition-all shadow-lg',
                loading ? 'bg-primary/90' : 'bg-primary hover:bg-black hover:shadow-primary/20 active:scale-[0.98]'
              )}
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>{mode === 'login' ? 'Validando...' : 'Criando conta...'}</span>
                </div>
              ) : mode === 'login' ? 'Acessar Dashboard' : 'Criar Conta'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
