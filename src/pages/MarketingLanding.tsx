import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Eye,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import logoLight from '../../img-site/Group 129.svg';
import logoDark from '../../img-site/Group 128.svg';

const whatsappHref = 'https://wa.me/5512981092776';

const trustFeatures = [
  {
    title: 'Diagnostico individual por atendente',
    text: 'Entenda padroes de comportamento, pontos fortes e falhas recorrentes de cada vendedor sem depender so da percepcao do supervisor.',
  },
  {
    title: 'Leitura profunda das conversas',
    text: 'Avalie clareza, empatia, conducao, objetividade, qualidade da argumentacao e qualidade da abordagem em cada atendimento.',
  },
  {
    title: 'Insights acionaveis para gestao',
    text: 'Receba analises que ajudam o gestor a treinar melhor a equipe, corrigir gargalos e replicar boas praticas mais rapido.',
  },
];

const proofPills = [
  'Diagnostico por atendente',
  'Leitura de conversas com IA',
  'Indicadores de SLA e qualidade',
  'Insights para treinamento',
];

const platformSignals = [
  {
    icon: Eye,
    title: 'Visibilidade total',
    detail: 'Entenda o que acontece em cada atendimento, com contexto e historico.',
  },
  {
    icon: Zap,
    title: 'Correcao rapida',
    detail: 'Encontre falhas, objeções mal tratadas e oportunidades perdidas antes que se repitam.',
  },
  {
    icon: Users,
    title: 'Equipe mais forte',
    detail: 'Use dados para subir o padrao comercial do time e orientar feedbacks melhores.',
  },
];

const platformCards = [
  {
    icon: MessageSquareText,
    eyebrow: 'Conversas',
    title: 'Cada atendimento deixa de ser um print solto e vira dado de gestao.',
    text: 'A plataforma organiza conversas, respostas e comportamento comercial em uma leitura que o gestor consegue comparar, acompanhar e cobrar.',
  },
  {
    icon: Target,
    eyebrow: 'Treinamento',
    title: 'Feedback deixa de ser generico e passa a ser orientado por evidencia.',
    text: 'Voce identifica quem investiga mal, quem responde sem conduzir, quem contorna bem objecoes e quem precisa de apoio imediato.',
  },
  {
    icon: BarChart3,
    eyebrow: 'Operacao',
    title: 'O gestor passa a enxergar tendencia, risco e consistencia do time.',
    text: 'Nao e so sobre uma conversa boa ou ruim. E sobre descobrir padroes da equipe e agir antes que a queda de qualidade vire prejuizo.',
  },
];

const faqItems: { q: string; a: string }[] = [
  {
    q: 'A X9.Sales mostra se o atendente esta bem ou mal?',
    a: 'Sim. A plataforma avalia cada conversa com base em criterios como clareza, conducao, empatia, investigacao da necessidade, contorno de objecoes e qualidade da abordagem, permitindo identificar padroes fortes e fracos por atendente.',
  },
  {
    q: 'A plataforma funciona mesmo sem integrar a venda final?',
    a: 'Sim. Mesmo sem o dado final de venda, a X9.Sales mede a qualidade da execucao do atendimento e revela se o vendedor esta aumentando ou reduzindo a chance de conversao durante a conversa.',
  },
  {
    q: 'O que exatamente a plataforma analisa nas conversas?',
    a: 'A analise pode incluir tempo de resposta, organizacao do atendimento, clareza na comunicacao, profundidade da investigacao, tratamento de objecoes, postura comercial, oportunidades perdidas e pontos de melhoria.',
  },
  {
    q: 'Isso ajuda no treinamento da equipe?',
    a: 'Muito. Em vez de feedback generico, o gestor passa a ter evidencias concretas sobre o que corrigir, o que reforcar e quais comportamentos precisam ser replicados no time.',
  },
  {
    q: 'A X9.Sales e para supervisores ou donos da operacao?',
    a: 'Para os dois. Supervisores ganham velocidade na analise e acompanhamento do time. Donos e gestores ganham visao estrategica sobre qualidade operacional, risco e eficiencia comercial.',
  },
];

const footerColumns = [
  {
    title: 'LINKS',
    items: ['Sobre', 'Funcionalidades', 'FAQ', 'Contato'],
  },
  {
    title: 'PRODUTO',
    items: ['Monitoramento', 'Analise IA', 'Ranking', 'Auditoria'],
  },
  {
    title: 'EMPRESA',
    items: ['Politica de Privacidade', 'Suporte', 'Termos de Uso'],
  },
];

export default function MarketingLanding() {
  const [openFaq, setOpenFaq] = useState<string>(faqItems[0].q);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const heroStageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = pageRef.current;
    if (!root || typeof window === 'undefined') return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;

    void (async () => {
      const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ]);

      if (disposed) return;

      gsap.registerPlugin(ScrollTrigger);

      const ctx = gsap.context(() => {
        const heroTimeline = gsap.timeline({ defaults: { ease: 'power3.out' } });
        heroTimeline
          .from('[data-hero-badge]', { opacity: 0, y: 18, duration: 0.45 })
          .from('[data-hero-title]', { opacity: 0, y: 26, duration: 0.7 }, '-=0.2')
          .from('[data-hero-copy]', { opacity: 0, y: 20, duration: 0.55 }, '-=0.4')
          .from('[data-hero-actions]', { opacity: 0, y: 18, duration: 0.45 }, '-=0.35')
          .from('[data-hero-pills] > *', { opacity: 0, y: 14, duration: 0.35, stagger: 0.06 }, '-=0.2')
          .from('[data-hero-visual]', { opacity: 0, y: 24, scale: 0.96, duration: 0.8 }, '-=0.5');

        gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((element) => {
          gsap.from(element, {
            opacity: 0,
            y: 34,
            duration: 0.7,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: element,
              start: 'top 84%',
              once: true,
            },
          });
        });

        gsap.utils.toArray<HTMLElement>('[data-float]').forEach((element, index) => {
          gsap.to(element, {
            y: index % 2 === 0 ? -10 : 10,
            duration: 3.3 + index * 0.2,
            repeat: -1,
            yoyo: true,
            ease: 'sine.inOut',
          });
        });

        gsap.to('[data-parallax-figure]', {
          yPercent: -7,
          ease: 'none',
          scrollTrigger: {
            trigger: heroStageRef.current,
            start: 'top top',
            end: 'bottom top',
            scrub: 0.8,
          },
        });

        gsap.to('[data-parallax-glow="primary"]', {
          yPercent: -10,
          xPercent: 4,
          ease: 'none',
          scrollTrigger: {
            trigger: heroStageRef.current,
            start: 'top top',
            end: 'bottom top',
            scrub: 1,
          },
        });

        gsap.to('[data-parallax-glow="secondary"]', {
          yPercent: -14,
          xPercent: -3,
          ease: 'none',
          scrollTrigger: {
            trigger: heroStageRef.current,
            start: 'top top',
            end: 'bottom top',
            scrub: 1,
          },
        });
      }, root);

      cleanup = () => {
        ctx.revert();
      };
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return (
    <div
      ref={pageRef}
      className="min-h-screen bg-[#f5f5f4] text-[#181818]"
      style={{
        fontFamily: '"Outfit","Manrope","Segoe UI",sans-serif',
        backgroundImage:
          'repeating-linear-gradient(90deg, rgba(20,20,20,0.06) 0, rgba(20,20,20,0.06) 1px, transparent 1px, transparent 56px)',
      }}
    >
      <section className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_top,rgba(89,69,253,0.1),transparent_48%),radial-gradient(circle_at_18%_24%,rgba(211,254,24,0.14),transparent_30%)]" />

        <div className="relative mx-auto max-w-[1240px] px-4 pb-0 pt-4 sm:px-6 md:px-10 lg:px-0 lg:pt-5">
          <header className="mx-auto flex max-w-[1240px] items-center justify-between rounded-full border border-white/60 bg-[#161616] px-3 py-3.5 text-white shadow-[0_18px_40px_rgba(0,0,0,0.22)] backdrop-blur md:px-5 lg:px-8">
            <Link to="/" className="flex items-center gap-3">
              <img src={logoDark} alt="X9.Sales" className="h-7 w-auto sm:h-8" />
            </Link>

            <nav className="hidden items-center gap-8 text-sm text-white/72 md:flex">
              <a href="#sobre" className="transition hover:text-white">Sobre</a>
              <a href="#funcionalidades" className="transition hover:text-white">Funcionalidades</a>
              <a href="#faq" className="transition hover:text-white">FAQ</a>
              <a href="#contato" className="transition hover:text-white">Contato</a>
            </nav>

            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                to="/login"
                className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/10 sm:px-5 sm:text-sm"
              >
                Login
              </Link>
              <a
                href={whatsappHref}
                target="_blank"
                rel="noreferrer"
                style={{ backgroundColor: '#D3FE18', color: '#161616' }}
                className="rounded-full px-4 py-2 text-xs font-semibold transition hover:brightness-95 sm:px-5 sm:text-sm"
              >
                Contratar
              </a>
            </div>
          </header>

          <div
            id="sobre"
            className="grid items-center gap-12 pt-6 md:pt-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)] lg:gap-10 lg:pt-0"
          >
            <div className="max-w-[640px]">
              <div data-hero-badge className="inline-flex items-center gap-2 rounded-full border border-[#dadada] bg-white/90 px-4 py-2 text-sm font-medium text-[#4f4f4f] shadow-sm backdrop-blur">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-[#d4ff18] text-[#161616]">
                  <ShieldCheck size={14} strokeWidth={2.5} />
                </span>
                Monitoramento inteligente de atendimento e performance comercial
              </div>

              <h1
                data-hero-title
                className="mt-6 max-w-[720px] text-[42px] font-semibold leading-[0.94] tracking-[-0.05em] text-[#161616] sm:text-[54px]"
                style={{ fontSize: 'clamp(42px, 4.6vw, 62px)' }}
              >
                Transforme conversas em dados, diagnostico e melhoria real
              </h1>
              <p data-hero-copy className="mt-6 max-w-[560px] text-[15px] leading-7 text-[#666] sm:text-base md:text-lg md:leading-8">
                A X9.Sales monitora cada atendimento da sua equipe, analisa a qualidade das conversas e mostra pontos fortes, falhas, oportunidades perdidas e padroes de melhoria por atendente.
              </p>

              <div data-hero-actions className="mt-8 flex flex-wrap items-center gap-3 sm:gap-4">
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noreferrer"
                  style={{ backgroundColor: '#D3FE18', color: '#161616' }}
                  className="rounded-full px-6 py-3 text-sm font-semibold shadow-[0_12px_24px_rgba(212,255,24,0.28)] transition hover:-translate-y-0.5"
                >
                  Solicitar demonstracao
                </a>
                <a
                  href="#funcionalidades"
                  className="rounded-full border border-[#1b1b1b] bg-white px-6 py-3 text-sm font-semibold text-[#1b1b1b] transition hover:bg-[#1b1b1b] hover:text-white"
                >
                  Ver como funciona
                </a>
              </div>

              <div data-hero-pills className="mt-8 flex flex-wrap gap-2.5">
                {proofPills.map((pill) => (
                  <span
                    key={pill}
                    className="rounded-full border border-[#dddddd] bg-white/90 px-4 py-2 text-xs font-medium text-[#575757] shadow-sm"
                  >
                    {pill}
                  </span>
                ))}
              </div>
            </div>

            <div data-hero-visual className="relative mx-auto flex w-full max-w-[560px] items-end justify-center lg:justify-end">
              <div ref={heroStageRef} className="relative h-[640px] w-full max-w-[560px] sm:h-[820px]" style={{ maxWidth: '560px' }}>
                <div data-parallax-glow="primary" className="absolute left-1/2 top-[18%] h-[360px] w-[360px] -translate-x-1/2 rounded-full bg-[#5945fd]/8 blur-3xl sm:h-[470px] sm:w-[470px]" />
                <div data-parallax-glow="secondary" className="absolute left-1/2 top-[21%] h-[280px] w-[280px] -translate-x-1/2 rounded-full bg-[#d3fe18]/7 blur-3xl sm:h-[340px] sm:w-[340px]" />
                <img
                  data-parallax-figure
                  src="/img-site/homem%20home.png"
                  alt="Pessoa observando com binoculos"
                  className="absolute left-1/2 z-20 -translate-x-1/2 drop-shadow-[0_18px_42px_rgba(0,0,0,0.14)]"
                  style={{
                    bottom: '0',
                    width: 'min(690px, 128%)',
                  }}
                />

                <div data-float className="absolute left-0 top-[13%] z-40 max-w-[220px] rounded-[24px] border border-white/70 bg-white/92 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.1)] backdrop-blur sm:left-[2%] lg:-left-2">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#d4ff18]/20 text-[#161616]">
                      <TrendingUp size={18} />
                    </span>
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-[#8b8b8b]">Qualidade</p>
                      <p className="text-lg font-semibold text-[#1b1b1b]">+ consistencia</p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#686868]">Identifique quem sustenta o padrao da equipe e onde a operacao comeca a cair.</p>
                </div>

                <div data-float className="absolute bottom-[12%] right-0 z-40 max-w-[220px] rounded-[24px] border border-[#202020] bg-[#161616] p-4 text-white shadow-[0_20px_50px_rgba(0,0,0,0.16)] sm:right-[2%] lg:right-0">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#d4ff18] text-[#161616]">
                      <Sparkles size={18} />
                    </span>
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-white/45">Gestao</p>
                      <p className="text-lg font-semibold">feedback com criterio</p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-white/65">Transforme percepcao em argumento concreto para treinar, cobrar e evoluir o time.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div data-reveal className="border-y border-black/5 bg-[#efefef]/85 py-8 backdrop-blur">
          <div className="mx-auto grid max-w-[1240px] gap-4 px-4 text-center sm:grid-cols-3 sm:px-6 md:px-10 lg:px-0">
            {platformSignals.map((item) => (
              <div key={item.title} className="rounded-[24px] bg-white/75 px-5 py-5 shadow-[0_12px_30px_rgba(0,0,0,0.03)]">
                <div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-[#d4ff18]/25 text-[#161616]">
                  <item.icon size={18} />
                </div>
                <p className="mt-4 text-base font-semibold text-[#202020]">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-[#717171]">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-[1240px] space-y-24 px-4 py-16 sm:px-6 md:px-10 lg:px-0 lg:py-20">
        <section data-reveal id="funcionalidades" className="grid items-center gap-12 lg:grid-cols-[1.02fr_0.98fr]">
          <div className="max-w-[500px]">
            <p className="text-xs font-medium uppercase tracking-[0.28em] text-[#7f7f7f]">Analise</p>
            <h2 className="mt-3 text-[36px] font-semibold leading-[1.02] tracking-[-0.04em] md:text-[58px]">
              Veja o que realmente acontece em cada atendimento
            </h2>
            <p className="mt-5 max-w-[460px] text-[15px] leading-7 text-[#777]">
              A X9.Sales analisa cada conversa da equipe para mostrar como os atendentes se comunicam, conduzem o cliente, tratam objecoes e criam ou perdem oportunidades durante o atendimento.
            </p>

            <div className="mt-10 space-y-5">
              {trustFeatures.map((item, index) => (
                <div key={item.title} className="flex gap-4 rounded-[24px] border border-[#ececec] bg-white/80 px-4 py-4 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
                  <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[#d8d8d8] bg-white text-xs text-[#666]">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-base font-semibold">{item.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-[#777]">{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-5">
            {platformCards.map((card, index) => (
              <article
                key={card.title}
                className={[
                  'rounded-[30px] border px-6 py-6 shadow-[0_18px_40px_rgba(0,0,0,0.05)]',
                  index === 1
                    ? 'border-[#1d1d1d] bg-[#161616] text-white'
                    : 'border-[#e7e7e7] bg-white/82 text-[#181818]',
                ].join(' ')}
              >
                <div className={[
                  'grid h-12 w-12 place-items-center rounded-2xl',
                  index === 1 ? 'bg-[#d4ff18] text-[#161616]' : 'bg-[#5945fd]/10 text-[#5945fd]',
                ].join(' ')}>
                  <card.icon size={20} />
                </div>
                <p className={[
                  'mt-5 text-xs font-semibold uppercase tracking-[0.28em]',
                  index === 1 ? 'text-white/45' : 'text-[#7f7f7f]',
                ].join(' ')}>
                  {card.eyebrow}
                </p>
                <h3 className="mt-3 text-[24px] font-semibold leading-[1.08] tracking-[-0.03em]">
                  {card.title}
                </h3>
                <p className={[
                  'mt-4 text-sm leading-7',
                  index === 1 ? 'text-white/70' : 'text-[#6f6f6f]',
                ].join(' ')}>
                  {card.text}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section data-reveal className="grid items-center gap-12 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="order-2 rounded-[28px] bg-[#efefef] p-5 md:p-7 lg:order-1">
            <div className="flex flex-col items-center justify-center gap-6 py-12">
              <div className="grid h-20 w-20 place-items-center rounded-2xl bg-[#d4ff18] shadow-lg">
                <Target size={36} className="text-[#161616]" />
              </div>
              <p className="max-w-[340px] text-center text-sm leading-6 text-[#777]">
                Em vez de depender apenas da percepcao do supervisor, a plataforma transforma conversas em indicadores claros para agir com mais velocidade e criterio.
              </p>
            </div>
          </div>

          <div className="order-1 max-w-[530px] justify-self-end lg:order-2">
            <p className="text-xs font-medium uppercase tracking-[0.28em] text-[#7f7f7f]">Controle</p>
            <h2 className="mt-3 text-[36px] font-semibold leading-[1.02] tracking-[-0.04em] md:text-[58px]">
              Mais visibilidade, mais consistencia, mais controle
            </h2>
            <p className="mt-5 text-[15px] leading-7 text-[#777]">
              Assim, voce entende quem esta performando bem, quem precisa de apoio e onde a operacao esta falhando antes que isso derrube o resultado do time.
            </p>

            <ul className="mt-7 space-y-4 text-sm text-[#555]">
              <li className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full bg-[#d4ff18]" />
                Monitore a qualidade do atendimento em escala
              </li>
              <li className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full bg-[#d4ff18]" />
                Detecte padroes positivos e negativos da equipe
              </li>
              <li className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full bg-[#d4ff18]" />
                Encontre oportunidades perdidas antes que virem prejuizo
              </li>
              <li className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full bg-[#d4ff18]" />
                Padronize a evolucao comercial do time
              </li>
            </ul>

            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#161616] px-6 py-3 text-sm font-semibold text-white transition hover:translate-x-0.5"
            >
              Quero ver na pratica
              <ArrowUpRight size={16} />
            </a>
          </div>
        </section>

        <section data-reveal id="faq" className="grid gap-12 lg:grid-cols-[0.88fr_1.12fr]">
          <div className="max-w-[380px]">
            <p className="text-xs font-medium uppercase tracking-[0.28em] text-[#7f7f7f]">FAQ</p>
            <h2 className="mt-3 text-[34px] font-semibold leading-[1.03] tracking-[-0.04em] md:text-[52px]">
              Perguntas que todo gestor faz e a X9.Sales responde
            </h2>
            <p className="mt-5 text-sm leading-6 text-[#777]">
              Quais atendentes estao conduzindo melhor as conversas? Onde estamos perdendo clientes? Quem precisa de treinamento? A plataforma ajuda voce a responder isso com dados reais do atendimento.
            </p>
            <a href="mailto:contato@x9sales.com" className="mt-8 inline-block text-sm font-medium text-[#5945FD] underline-offset-4 hover:underline">
              contato@x9sales.com
            </a>
          </div>

          <div className="space-y-3">
            {faqItems.map(({ q, a }) => {
              const isOpen = openFaq === q;
              return (
                <button
                  key={q}
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? '' : q)}
                  className="w-full rounded-[24px] border border-[#dfdfdf] bg-white px-5 py-5 text-left shadow-[0_10px_30px_rgba(0,0,0,0.03)] transition hover:border-[#cfcfcf]"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-base font-medium text-[#242424]">{q}</span>
                    {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                  {isOpen && (
                    <p className="mt-3 max-w-[560px] text-sm leading-6 text-[#777]">
                      {a}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      </main>

      <section data-reveal id="contato" className="px-4 pb-16 sm:px-6 md:px-10 lg:px-0 lg:pb-20">
        <div className="mx-auto max-w-[1240px] overflow-hidden rounded-[32px] bg-[#121212] px-6 py-12 text-center text-white shadow-[0_30px_80px_rgba(0,0,0,0.24)] sm:px-8 md:px-16 md:py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">Demonstracao guiada</p>
          <h2 className="mx-auto mt-4 max-w-[760px] text-[32px] font-semibold leading-[1.02] tracking-[-0.04em] md:text-[54px]">
            Pare de avaliar sua equipe no achismo
          </h2>
          <p className="mx-auto mt-5 max-w-[620px] text-sm leading-7 text-white/68 md:text-base">
            Com a X9.Sales, voce monitora atendimentos, identifica padroes de performance e descobre o que precisa ser ajustado para elevar a qualidade comercial da operacao.
          </p>
          <p className="mx-auto mt-3 max-w-[560px] text-sm leading-6 text-white/50">
            Tenha uma visao clara do comportamento da equipe, dos pontos de melhoria e das oportunidades escondidas dentro das conversas.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              style={{ backgroundColor: '#D3FE18', color: '#161616' }}
              className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition hover:-translate-y-0.5"
            >
              Agendar demonstracao
            </a>
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Falar com especialista
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#e6e6e6] px-4 pb-24 pt-12 sm:px-6 md:px-10 lg:px-0 lg:pb-10">
        <div className="mx-auto grid max-w-[1240px] gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <div className="flex items-center gap-3">
              <img src={logoLight} alt="X9.Sales" className="h-4 w-auto" />
            </div>
            <p className="mt-5 max-w-[340px] text-sm leading-6 text-[#7a7a7a]">
              X9.Sales. Inteligencia para monitorar, analisar e evoluir o atendimento da sua equipe.
            </p>

            <form className="mt-8 flex max-w-[340px] items-center rounded-full border border-[#d8d8d8] bg-white p-1 shadow-sm">
              <input
                type="email"
                placeholder="Seu melhor e-mail"
                className="w-full bg-transparent px-4 py-3 text-sm outline-none placeholder:text-[#9a9a9a]"
              />
              <button type="button" className="rounded-full bg-[#161616] px-5 py-3 text-sm font-semibold text-white">
                Assinar
              </button>
            </form>
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            {footerColumns.map((column) => (
              <div key={column.title}>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8d8d8d]">{column.title}</p>
                <div className="mt-5 space-y-3">
                  {column.items.map((item) => (
                    <a key={item} href="#" className="block text-sm text-[#444] transition hover:text-black">
                      {item}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-10 flex max-w-[1240px] flex-col items-start justify-between gap-5 border-t border-[#e6e6e6] pt-6 text-sm text-[#8c8c8c] md:flex-row md:items-center">
          <p>© 2026 X9.Sales. Todos os direitos reservados.</p>
          <div className="flex items-center gap-4 text-[#161616]">
            <a href="#" aria-label="Instagram" className="grid h-8 w-8 place-items-center rounded-full border border-[#d8d8d8] bg-white text-xs">ig</a>
            <a href="#" aria-label="LinkedIn" className="grid h-8 w-8 place-items-center rounded-full border border-[#d8d8d8] bg-white text-xs">in</a>
          </div>
        </div>
      </footer>

      <div className="fixed inset-x-4 bottom-4 z-50 md:hidden">
        <a
          href={whatsappHref}
          target="_blank"
          rel="noreferrer"
          style={{ backgroundColor: '#D3FE18', color: '#161616' }}
          className="flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold shadow-[0_18px_40px_rgba(0,0,0,0.16)]"
        >
          Solicitar demonstracao
          <ArrowUpRight size={16} />
        </a>
      </div>
    </div>
  );
}
