import type { FormEvent } from 'react';
import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import logoLight from '../../../img-site/Group 129.svg';
import logoDark from '../../../img-site/Group 128.svg';

// ── shared input style ────────────────────────────────────────────────────────

function inputCls(dark: boolean) {
  return cn(
    'w-full h-12 px-4 text-sm rounded-xl outline-none transition-all',
    dark
      ? 'bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-[#D3FE18] focus:ring-2 focus:ring-[#D3FE18]/20'
      : 'bg-white border border-[#E8E8E7] text-[#111] placeholder-[#aaa] focus:border-[#D3FE18] focus:ring-2 focus:ring-[#D3FE18]/20',
  );
}

const GoogleIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const AppleIcon = () => (
  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.14-2.18 1.27-2.16 3.79.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.84M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
  </svg>
);

function SocialButtons({ dark }: { dark: boolean }) {
  const cls = cn(
    'flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-semibold border transition-all hover:opacity-80',
    dark ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-[#E8E8E7] text-[#111]',
  );
  return (
    <div className="grid grid-cols-2 gap-3">
      <button type="button" className={cls}><GoogleIcon /> Google</button>
      <button type="button" className={cls}><AppleIcon /> Apple</button>
    </div>
  );
}

function Divider({ dark }: { dark: boolean }) {
  return (
    <div className="relative flex items-center gap-3">
      <div className={cn('flex-1 h-px', dark ? 'bg-white/10' : 'bg-black/10')} />
      <span className={cn('text-xs font-medium', dark ? 'text-white/30' : 'text-[#aaa]')}>ou autorize com</span>
      <div className={cn('flex-1 h-px', dark ? 'bg-white/10' : 'bg-black/10')} />
    </div>
  );
}

// ── login panel ───────────────────────────────────────────────────────────────

function LoginPanel() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: err } = await signIn(email, password);
      if (err) setError('E-mail ou senha inválidos. Tente novamente.');
    } catch {
      setError('Ocorreu um erro. Verifique sua conexão.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-8 bg-[#F5F5F4]">
      <div className="w-full max-w-[360px] space-y-7">
        <img src={logoLight} alt="MonitoraIA" className="h-4 w-auto" />

        <div className="space-y-1.5">
          <h1 className="text-xl font-bold text-[#111]">Entrar na MonitoraIA</h1>
          <p className="text-sm text-[#888] leading-relaxed">Monitore e otimize o desempenho da sua equipe.</p>
        </div>

        {error && (
          <div className="text-sm rounded-xl p-3 border bg-red-50 border-red-100 text-red-500">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder="Seu e-mail"
            className={inputCls(false)}
          />
          <div className="relative">
            <input
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="Sua senha"
              className={cn(inputCls(false), 'pr-12')}
            />
            <button
              type="button"
              onClick={() => setShowPwd(v => !v)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#bbb] hover:text-[#666] transition-colors"
            >
              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{ backgroundColor: '#5945FD', color: '#fff' }}
            className="w-full h-12 rounded-xl text-sm font-bold tracking-tight transition-all hover:brightness-95 active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Validando...</> : 'Entrar'}
          </button>
        </form>

        <button type="button" className="text-sm font-medium text-[#888] hover:text-[#333] transition-colors w-full text-center">
          Esqueceu a senha?
        </button>

        <Divider dark={false} />
        <SocialButtons dark={false} />
      </div>
    </div>
  );
}

// ── signup panel ──────────────────────────────────────────────────────────────

function SignupPanel() {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (password !== confirm) { setError('As senhas não coincidem.'); return; }
    setLoading(true);
    try {
      const { error: err } = await signUp(email, password);
      if (err) setError(err.message || 'Erro ao criar conta.');
      else setSuccess('Conta criada! Verifique seu e-mail para confirmar o cadastro.');
    } catch {
      setError('Ocorreu um erro. Verifique sua conexão.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-8 bg-[#0D0D0D]">
      <div className="w-full max-w-[360px] space-y-7">
        <img src={logoDark} alt="MonitoraIA" className="h-4 w-auto" />

        <div className="space-y-1.5">
          <h1 className="text-xl font-bold text-white">Criar sua conta</h1>
          <p className="text-sm text-white/50 leading-relaxed">Comece a usar o poder da IA no seu atendimento.</p>
        </div>

        {error && (
          <div className="text-sm rounded-xl p-3 border bg-red-500/10 border-red-500/20 text-red-400">{error}</div>
        )}
        {success && (
          <div className="text-sm rounded-xl p-3 border bg-[#D3FE18]/10 border-[#D3FE18]/20 text-[#D3FE18]">{success}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder="Seu e-mail"
            className={inputCls(true)}
          />
          <div className="relative">
            <input
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="Criar senha"
              className={cn(inputCls(true), 'pr-12')}
            />
            <button
              type="button"
              onClick={() => setShowPwd(v => !v)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
            >
              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
            placeholder="Confirmar senha"
            className={inputCls(true)}
          />

          <button
            type="submit"
            disabled={loading}
            style={{ backgroundColor: '#D3FE18', color: '#000' }}
            className="w-full h-12 rounded-xl text-sm font-bold tracking-tight transition-all hover:brightness-95 active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Criando conta...</> : 'Criar Conta Grátis'}
          </button>
        </form>

        <p className="text-center text-xs text-white/30 leading-relaxed">
          Ao criar sua conta você concorda com os{' '}
          <span className="text-white/50 underline cursor-pointer">Termos de Uso</span>
          {' '}e{' '}
          <span className="text-white/50 underline cursor-pointer">Política de Privacidade</span>.
        </p>

        <Divider dark={true} />
        <SocialButtons dark={true} />
      </div>
    </div>
  );
}

// ── export ────────────────────────────────────────────────────────────────────

export function LoginForm({ initialMode: _initialMode = 'login' }: { initialMode?: 'login' | 'signup' }) {
  return (
    <div className="min-h-screen flex font-sans antialiased overflow-hidden">
      {/* Left — Login */}
      <LoginPanel />

      {/* Divider */}
      <div className="w-px bg-black/10 hidden lg:block shrink-0" />

      {/* Right — Signup */}
      <div className="hidden lg:flex flex-1">
        <SignupPanel />
      </div>
    </div>
  );
}
