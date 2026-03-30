import type { ElementType } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Brain,
  CalendarRange,
  CheckCircle2,
  Clock3,
  Lightbulb,
  Loader2,
  MessageSquareWarning,
  Radar,
  Sparkles,
  Target,
  TrendingUp,
  Users2,
} from 'lucide-react';
import type {
  ProductIntelligenceCause,
  ProductIntelligenceRun,
  ProductIntelligenceStrategicItem,
  ProductIntelligenceStrategicReport,
} from '../../types';
import { cn, formatDateTime } from '../../lib/utils';

const causeLabels: Record<ProductIntelligenceCause, string> = {
  produto: 'Produto',
  comunicacao: 'Comunicacao',
  posicionamento: 'Posicionamento',
  oferta: 'Oferta',
  atendimento: 'Atendimento',
  preco: 'Preco',
  expectativa: 'Expectativa',
};

function severityTone(severity: ProductIntelligenceStrategicItem['severity']) {
  switch (severity) {
    case 'critical':
      return 'border-red-200 bg-red-50 text-red-700';
    case 'high':
      return 'border-orange-200 bg-orange-50 text-orange-700';
    case 'medium':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    default:
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
}

function causeTone(cause: ProductIntelligenceCause) {
  switch (cause) {
    case 'produto':
      return 'bg-secondary/10 text-secondary';
    case 'preco':
      return 'bg-amber-100 text-amber-700';
    case 'atendimento':
      return 'bg-blue-100 text-blue-700';
    case 'posicionamento':
      return 'bg-violet-100 text-violet-700';
    case 'oferta':
      return 'bg-rose-100 text-rose-700';
    case 'expectativa':
      return 'bg-slate-100 text-slate-700';
    default:
      return 'bg-primary/10 text-primary';
  }
}

function OverviewCard({
  label,
  value,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: string;
  icon: ElementType;
  tone?: 'default' | 'risk' | 'opportunity';
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-4',
        tone === 'risk' && 'border-red-200 bg-red-50/80',
        tone === 'opportunity' && 'border-primary/25 bg-primary/5',
        tone === 'default' && 'border-border bg-card',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
          <p className="text-sm leading-relaxed text-foreground">{value}</p>
        </div>
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl',
            tone === 'risk' && 'bg-red-100 text-red-600',
            tone === 'opportunity' && 'bg-primary/15 text-primary',
            tone === 'default' && 'bg-muted text-muted-foreground',
          )}
        >
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
    </div>
  );
}

function InsightCard({ item }: { item: ProductIntelligenceStrategicItem }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold text-foreground">{item.title}</h4>
        <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', severityTone(item.severity))}>
          {item.severity}
        </span>
        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', causeTone(item.likely_cause))}>
          {causeLabels[item.likely_cause]}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.summary}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        <span className="rounded-full bg-muted px-2 py-0.5">Frequencia: {item.frequency ?? '--'}</span>
        <span className="rounded-full bg-muted px-2 py-0.5">Urgencia: {item.urgency}</span>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{item.impact}</p>
      {item.evidence_conversation_ids.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.evidence_conversation_ids.slice(0, 3).map((conversationId) => (
            <Link
              key={conversationId}
              to={`/conversations/${conversationId}`}
              className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-[11px] font-semibold text-primary transition-colors hover:border-primary/35 hover:bg-primary/10"
            >
              Conversa {conversationId.slice(0, 8)}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function InsightSection({
  title,
  icon: Icon,
  items,
  emptyText,
}: {
  title: string;
  icon: ElementType;
  items: ProductIntelligenceStrategicItem[];
  emptyText: string;
}) {
  return (
    <section className="space-y-3 rounded-[26px] border border-border bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Icon className="h-4.5 w-4.5 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {items.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((item) => (
            <InsightCard key={`${title}-${item.title}`} item={item} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          {emptyText}
        </div>
      )}
    </section>
  );
}

export function ProductIntelligenceStrategicPanel({
  run,
  report,
  isLoading,
}: {
  run: ProductIntelligenceRun | null;
  report: ProductIntelligenceStrategicReport | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="rounded-[28px] border border-border bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando leitura estrategica...
        </div>
      </div>
    );
  }

  if (run && (run.status === 'queued' || run.status === 'running')) {
    const total = Math.max(run.total_conversations || 0, 1);
    const progress = Math.min(100, Math.round(((run.processed_count || 0) / total) * 100));

    return (
      <div className="rounded-[28px] border border-primary/20 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
              <Brain className="h-3.5 w-3.5" />
              Inteligencia estrategica em andamento
            </div>
            <h3 className="text-2xl font-bold tracking-[-0.03em] text-foreground">A IA esta lendo o periodo inteiro</h3>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Estamos consolidando todas as conversas do periodo para responder o que realmente importa sobre produto,
              oferta, comunicacao, objecoes, dores e decisoes prioritarias.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm lg:w-[360px]">
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="mt-1 font-semibold text-foreground">{run.status === 'queued' ? 'Na fila' : 'Analisando'}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Conversas</p>
              <p className="mt-1 font-semibold text-foreground">{run.total_conversations}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Processadas</p>
              <p className="mt-1 font-semibold text-foreground">{run.processed_count}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Falhas</p>
              <p className="mt-1 font-semibold text-foreground">{run.failed_count}</p>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Progresso</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
    );
  }

  if (run?.status === 'failed') {
    return (
      <div className="rounded-[28px] border border-red-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-foreground">A analise estrategica falhou</h3>
            <p className="text-sm text-muted-foreground">
              {run.error_message || 'Nao foi possivel consolidar o periodo. Tente rodar novamente.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="rounded-[28px] border border-dashed border-border bg-white p-8 shadow-sm">
        <div className="mx-auto max-w-3xl space-y-3 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl border border-primary/20 bg-primary/10 text-primary">
            <Radar className="h-6 w-6" />
          </div>
          <h3 className="text-2xl font-bold tracking-[-0.03em] text-foreground">O que voce precisa saber ainda nao foi consolidado</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Quando voce clicar em <strong>Analisar</strong>, a IA vai ler todas as conversas do periodo para mostrar
            percepcao de produto, objecoes, dores, duvidas, oportunidades e as 5 decisoes mais importantes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-border bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              O que voce precisa saber
            </div>
            <div>
              <h3 className="text-3xl font-bold tracking-[-0.04em] text-foreground">Leitura estrategica do periodo</h3>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{report.resumo_executivo}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-primary" />
              <span>Atualizado em {run?.finished_at ? formatDateTime(run.finished_at) : run?.created_at ? formatDateTime(run.created_at) : '--'}</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-primary" />
              <span>{report.totals.conversations_considered} conversas consideradas</span>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <OverviewCard label="Clareza" value={report.percepcao_geral_produto.clareza} icon={MessageSquareWarning} />
          <OverviewCard label="Valor percebido" value={report.percepcao_geral_produto.valor_percebido} icon={TrendingUp} />
          <OverviewCard label="Principal risco" value={report.percepcao_geral_produto.principal_risco} icon={AlertTriangle} tone="risk" />
          <OverviewCard label="Principal oportunidade" value={report.percepcao_geral_produto.principal_oportunidade} icon={Lightbulb} tone="opportunity" />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <InsightSection title="O que os clientes mais buscam" icon={Target} items={report.clientes_buscam} emptyText="Sem sinais suficientes de busca no periodo." />
        <InsightSection title="Principais dores dos clientes" icon={AlertTriangle} items={report.principais_dores} emptyText="Sem dores consolidadas no periodo." />
        <InsightSection title="Duvidas mais frequentes" icon={MessageSquareWarning} items={report.duvidas_frequentes} emptyText="Sem duvidas consolidadas no periodo." />
        <InsightSection title="Objecoes mais frequentes" icon={AlertTriangle} items={report.objecoes_frequentes} emptyText="Sem objecoes consolidadas no periodo." />
        <InsightSection title="Valor percebido pelos clientes" icon={TrendingUp} items={report.valor_percebido} emptyText="Sem valor percebido consolidado no periodo." />
        <InsightSection title="Pontos de confusao sobre o produto" icon={Brain} items={report.pontos_de_confusao} emptyText="Sem confusoes consolidadas no periodo." />
        <InsightSection title="Oportunidades de melhoria de produto" icon={Lightbulb} items={report.melhorias_de_produto} emptyText="Sem melhorias de produto consolidadas." />
        <InsightSection title="Oferta e comunicacao" icon={Radar} items={report.melhorias_de_oferta_e_comunicacao} emptyText="Sem melhorias claras de oferta/comunicacao." />
      </div>

      <section className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="space-y-3 rounded-[26px] border border-border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Users2 className="h-4.5 w-4.5 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Perfis de cliente identificados</h3>
          </div>
          {report.perfis_de_cliente.length ? (
            <div className="grid gap-3">
              {report.perfis_de_cliente.map((profile) => (
                <div key={profile.profile} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-foreground">{profile.profile}</h4>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                      Frequencia: {profile.frequency ?? '--'}
                    </span>
                  </div>
                  <p className="mt-3 text-xs uppercase tracking-[0.16em] text-muted-foreground">Busca</p>
                  <p className="mt-1 text-sm text-foreground">{profile.what_they_seek}</p>
                  <p className="mt-3 text-xs uppercase tracking-[0.16em] text-muted-foreground">Trava</p>
                  <p className="mt-1 text-sm text-foreground">{profile.main_blockers}</p>
                  <p className="mt-3 text-xs uppercase tracking-[0.16em] text-muted-foreground">Melhor abordagem</p>
                  <p className="mt-1 text-sm text-foreground">{profile.best_approach}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              Sem perfis consistentes para este periodo.
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-[26px] border border-border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4.5 w-4.5 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Top 5 decisoes recomendadas</h3>
          </div>
          {report.top_5_decisoes_recomendadas.length ? (
            <div className="space-y-3">
              {report.top_5_decisoes_recomendadas.map((decision, index) => (
                <div key={`${decision.title}-${index}`} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                      {index + 1}
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-foreground">{decision.title}</h4>
                      <p className="text-sm text-muted-foreground">{decision.why_now}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">Impacto esperado:</span> {decision.expected_impact}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                          Urgencia: {decision.urgency}
                        </span>
                        {decision.evidence_conversation_ids.slice(0, 2).map((conversationId) => (
                          <Link
                            key={conversationId}
                            to={`/conversations/${conversationId}`}
                            className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-[11px] font-semibold text-primary transition-colors hover:border-primary/35 hover:bg-primary/10"
                          >
                            {conversationId.slice(0, 8)}
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              Ainda nao ha decisoes priorizadas.
            </div>
          )}
        </div>
      </section>

      <InsightSection title="Sinais estrategicos para tomada de decisao" icon={Target} items={report.sinais_estrategicos} emptyText="Sem sinais estrategicos consolidados no periodo." />
    </div>
  );
}
