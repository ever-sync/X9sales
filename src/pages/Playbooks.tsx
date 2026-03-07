import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BookCheck, Loader2, Megaphone, Plus, HelpCircle, X, CheckCircle2, Scale, ListChecks, Pencil, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../integrations/supabase/client';
import { useCompany } from '../contexts/CompanyContext';
import type { Playbook, PlaybookRule, PlaybookRuleType } from '../types';
import { CACHE } from '../config/constants';
import { env } from '../config/env';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';

const RULE_TYPES: Array<{ value: PlaybookRuleType; label: string }> = [
  { value: 'abertura', label: 'Abertura' },
  { value: 'qualificacao', label: 'Qualificacao' },
  { value: 'valor', label: 'Proposta de Valor' },
  { value: 'cta', label: 'CTA' },
  { value: 'contorno_objecao', label: 'Contorno Objecao' },
  { value: 'followup', label: 'Follow-up' },
  { value: 'custom', label: 'Custom' },
];

const RULE_WEIGHT_FILTERS = [
  { value: 'all', label: 'Todos os pesos' },
  { value: '0-5', label: 'Peso 0 a 5' },
  { value: '6-10', label: 'Peso 6 a 10' },
  { value: '11-20', label: 'Peso 11 a 20' },
  { value: '21+', label: 'Peso 21+' },
] as const;

const RULE_TYPE_STYLES: Record<PlaybookRuleType, string> = {
  abertura: 'bg-sky-100 text-sky-800 border-sky-200',
  qualificacao: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  valor: 'bg-violet-100 text-violet-800 border-violet-200',
  cta: 'bg-amber-100 text-amber-800 border-amber-200',
  contorno_objecao: 'bg-rose-100 text-rose-800 border-rose-200',
  followup: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  custom: 'bg-slate-100 text-slate-800 border-slate-200',
};

interface FunctionPayload {
  success?: boolean;
  error?: string;
  [key: string]: unknown;
}

interface RuleCardProps {
  rule: PlaybookRule;
  canManage: boolean;
  isEditing: boolean;
  isReorderEnabled: boolean;
  isDeletePending: boolean;
  onEdit: (rule: PlaybookRule) => void;
  onDelete: (rule: PlaybookRule) => void;
  children: React.ReactNode;
}

function SortableRuleCard({
  rule,
  canManage,
  isEditing,
  isReorderEnabled,
  isDeletePending,
  onEdit,
  onDelete,
  children,
}: RuleCardProps) {
  const ruleTypeLabel = RULE_TYPES.find((option) => option.value === rule.rule_type)?.label ?? rule.rule_type;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: rule.id,
    disabled: !isReorderEnabled || isEditing,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        'rounded-xl border border-border bg-card p-3',
        isDragging && 'opacity-60 shadow-lg',
      )}
    >
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <button
              type="button"
              className={cn(
                'cursor-grab rounded-lg border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground active:cursor-grabbing',
                !isReorderEnabled && 'cursor-not-allowed opacity-50',
              )}
              aria-label="Reordenar regra"
              title={isReorderEnabled ? 'Arraste para reordenar' : 'Limpe os filtros para reordenar'}
              {...attributes}
              {...listeners}
            >
              Drag
            </button>
          )}
          <span className={cn('rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide', RULE_TYPE_STYLES[rule.rule_type])}>
            {ruleTypeLabel}
          </span>
          {rule.is_required && (
            <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
              Obrigatoria
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Peso {rule.weight}</span>
          {canManage && !isEditing && (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => onEdit(rule)}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Editar
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-700"
                onClick={() => onDelete(rule)}
                disabled={isDeletePending}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Excluir
              </Button>
            </>
          )}
        </div>
      </div>

      {children}
    </div>
  );
}

async function invokePublishPlaybook(accessToken: string, companyId: string, playbookId: string) {
  const response = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/publish-playbook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      company_id: companyId,
      playbook_id: playbookId,
    }),
  });

  const raw = await response.text();
  let parsed: FunctionPayload | null = null;
  try {
    parsed = raw ? (JSON.parse(raw) as FunctionPayload) : null;
  } catch {
    parsed = null;
  }

  const backendMessage = (parsed?.error ?? raw ?? '').toString();
  if (!response.ok) throw new Error(backendMessage || `Falha HTTP ${response.status}`);
  if (!parsed || parsed.success !== true) throw new Error(backendMessage || 'Falha ao publicar playbook.');
}

export default function Playbooks() {
  const { companyId, role } = useCompany();
  const queryClient = useQueryClient();
  const canManage = role === 'owner_admin';

  const [showHelp, setShowHelp] = useState(false);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState('');
  const [newPlaybookName, setNewPlaybookName] = useState('');
  const [newPlaybookSegment, setNewPlaybookSegment] = useState('geral');
  const [newRuleText, setNewRuleText] = useState('');
  const [newRuleType, setNewRuleType] = useState<PlaybookRuleType>('abertura');
  const [newRuleWeight, setNewRuleWeight] = useState(10);
  const [newRuleRequired, setNewRuleRequired] = useState(false);
  const [ruleSearch, setRuleSearch] = useState('');
  const [ruleFilterType, setRuleFilterType] = useState<'all' | PlaybookRuleType>('all');
  const [ruleFilterRequired, setRuleFilterRequired] = useState<'all' | 'required' | 'optional'>('all');
  const [ruleWeightRange, setRuleWeightRange] = useState<(typeof RULE_WEIGHT_FILTERS)[number]['value']>('all');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editRuleText, setEditRuleText] = useState('');
  const [editRuleType, setEditRuleType] = useState<PlaybookRuleType>('abertura');
  const [editRuleWeight, setEditRuleWeight] = useState(10);
  const [editRuleRequired, setEditRuleRequired] = useState(false);
  const [rulePendingDelete, setRulePendingDelete] = useState<PlaybookRule | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const { data: playbooks, isLoading } = useQuery<Playbook[]>({
    queryKey: ['playbooks', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('playbooks')
        .select('*')
        .eq('company_id', companyId)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Playbook[];
    },
    enabled: !!companyId,
    staleTime: CACHE.STALE_TIME,
  });

  useEffect(() => {
    if (!selectedPlaybookId && playbooks && playbooks.length > 0) {
      setSelectedPlaybookId(playbooks[0].id);
    }
  }, [playbooks, selectedPlaybookId]);

  const { data: rules } = useQuery<PlaybookRule[]>({
    queryKey: ['playbook-rules', companyId, selectedPlaybookId],
    queryFn: async () => {
      if (!companyId || !selectedPlaybookId) return [];
      const { data, error } = await supabase
        .from('playbook_rules')
        .select('*')
        .eq('company_id', companyId)
        .eq('playbook_id', selectedPlaybookId)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PlaybookRule[];
    },
    enabled: !!companyId && !!selectedPlaybookId,
    staleTime: CACHE.STALE_TIME,
  });

  const selectedPlaybook = useMemo(
    () => playbooks?.find((row) => row.id === selectedPlaybookId) ?? null,
    [playbooks, selectedPlaybookId],
  );

  const filteredRules = useMemo(() => {
    const normalizedSearch = ruleSearch.trim().toLowerCase();
    return (rules ?? []).filter((rule) => {
      const matchesType = ruleFilterType === 'all' || rule.rule_type === ruleFilterType;
      const matchesRequired =
        ruleFilterRequired === 'all' ||
        (ruleFilterRequired === 'required' && rule.is_required) ||
        (ruleFilterRequired === 'optional' && !rule.is_required);
      const matchesWeight =
        ruleWeightRange === 'all' ||
        (ruleWeightRange === '0-5' && rule.weight >= 0 && rule.weight <= 5) ||
        (ruleWeightRange === '6-10' && rule.weight >= 6 && rule.weight <= 10) ||
        (ruleWeightRange === '11-20' && rule.weight >= 11 && rule.weight <= 20) ||
        (ruleWeightRange === '21+' && rule.weight >= 21);
      const matchesSearch =
        normalizedSearch.length === 0 ||
        rule.rule_text.toLowerCase().includes(normalizedSearch) ||
        rule.rule_type.toLowerCase().includes(normalizedSearch);
      return matchesType && matchesRequired && matchesWeight && matchesSearch;
    });
  }, [rules, ruleFilterRequired, ruleFilterType, ruleSearch, ruleWeightRange]);

  const isRuleFilterActive =
    ruleSearch.trim().length > 0 ||
    ruleFilterType !== 'all' ||
    ruleFilterRequired !== 'all' ||
    ruleWeightRange !== 'all';

  const createPlaybookMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error('Empresa nao selecionada.');
      if (!newPlaybookName.trim()) throw new Error('Informe o nome do playbook.');

      const { error } = await supabase.from('playbooks').insert({
        company_id: companyId,
        name: newPlaybookName.trim(),
        segment: newPlaybookSegment.trim() || 'geral',
        status: 'draft',
      });

      if (error) throw error;
    },
    onSuccess: () => {
      setNewPlaybookName('');
      setNewPlaybookSegment('geral');
      queryClient.invalidateQueries({ queryKey: ['playbooks', companyId] });
      toast.success('Playbook criado.');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Falha ao criar playbook.');
    },
  });

  const createRuleMutation = useMutation({
    mutationFn: async () => {
      if (!companyId || !selectedPlaybookId) throw new Error('Selecione um playbook.');
      if (!newRuleText.trim()) throw new Error('Informe o texto da regra.');

      const nextPosition = (rules?.length ?? 0) + 1;
      const { error } = await supabase.from('playbook_rules').insert({
        company_id: companyId,
        playbook_id: selectedPlaybookId,
        rule_type: newRuleType,
        rule_text: newRuleText.trim(),
        weight: newRuleWeight,
        is_required: newRuleRequired,
        position: nextPosition,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      setNewRuleText('');
      setNewRuleType('abertura');
      setNewRuleWeight(10);
      setNewRuleRequired(false);
      queryClient.invalidateQueries({ queryKey: ['playbook-rules', companyId, selectedPlaybookId] });
      toast.success('Regra adicionada.');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Falha ao adicionar regra.');
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: async () => {
      if (!companyId || !selectedPlaybookId || !editingRuleId) throw new Error('Selecione uma regra.');
      if (!editRuleText.trim()) throw new Error('Informe o texto da regra.');

      const { error } = await supabase
        .from('playbook_rules')
        .update({
          rule_type: editRuleType,
          rule_text: editRuleText.trim(),
          weight: editRuleWeight,
          is_required: editRuleRequired,
        })
        .eq('id', editingRuleId)
        .eq('company_id', companyId)
        .eq('playbook_id', selectedPlaybookId);

      if (error) throw error;
    },
    onSuccess: () => {
      setEditingRuleId(null);
      queryClient.invalidateQueries({ queryKey: ['playbook-rules', companyId, selectedPlaybookId] });
      toast.success('Regra atualizada.');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Falha ao atualizar regra.');
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      if (!companyId || !selectedPlaybookId) throw new Error('Selecione um playbook.');
      const { error } = await supabase
        .from('playbook_rules')
        .delete()
        .eq('id', ruleId)
        .eq('company_id', companyId)
        .eq('playbook_id', selectedPlaybookId);
      if (error) throw error;
    },
    onSuccess: () => {
      setRulePendingDelete(null);
      queryClient.invalidateQueries({ queryKey: ['playbook-rules', companyId, selectedPlaybookId] });
      toast.success('Regra excluida.');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Falha ao excluir regra.');
    },
  });

  const reorderRulesMutation = useMutation({
    mutationFn: async (orderedRules: PlaybookRule[]) => {
      if (!companyId || !selectedPlaybookId) throw new Error('Selecione um playbook.');
      const updates = orderedRules.map((rule, index) =>
        supabase
          .from('playbook_rules')
          .update({ position: index + 1 })
          .eq('id', rule.id)
          .eq('company_id', companyId)
          .eq('playbook_id', selectedPlaybookId)
      );

      const results = await Promise.all(updates);
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playbook-rules', companyId, selectedPlaybookId] });
      toast.success('Ordem das regras atualizada.');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Falha ao reordenar regras.');
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!companyId || !selectedPlaybookId) throw new Error('Selecione um playbook.');
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Sessao expirada.');
      await invokePublishPlaybook(token, companyId, selectedPlaybookId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playbooks', companyId] });
      toast.success('Playbook publicado.');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Falha ao publicar playbook.');
    },
  });

  const startEditingRule = (rule: PlaybookRule) => {
    setEditingRuleId(rule.id);
    setEditRuleText(rule.rule_text);
    setEditRuleType(rule.rule_type);
    setEditRuleWeight(rule.weight);
    setEditRuleRequired(rule.is_required);
  };

  const cancelEditingRule = () => {
    setEditingRuleId(null);
    setEditRuleText('');
    setEditRuleType('abertura');
    setEditRuleWeight(10);
    setEditRuleRequired(false);
  };

  const handleRuleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !rules || isRuleFilterActive) return;

    const oldIndex = rules.findIndex((rule) => rule.id === active.id);
    const newIndex = rules.findIndex((rule) => rule.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const orderedRules = arrayMove(rules, oldIndex, newIndex);
    reorderRulesMutation.mutate(orderedRules);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Playbooks</h2>
          <p className="text-muted-foreground">Padronize atendimento de alta conversao e publique versoes ativas.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowHelp((v) => !v)}>
            <HelpCircle className="mr-2 h-4 w-4" />
            Como usar
          </Button>
          {canManage && selectedPlaybookId && (
            <Button onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending}>
              {publishMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Megaphone className="mr-2 h-4 w-4" />}
              Publicar selecionado
            </Button>
          )}
        </div>
      </div>

      {showHelp && (
        <div className="rounded-2xl border border-primary/20 bg-accent/40 p-5 relative">
          <button
            type="button"
            onClick={() => setShowHelp(false)}
            className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
            <BookCheck className="h-5 w-5 text-primary" />
            Como funcionam os Playbooks
          </h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Playbooks definem os <strong>criterios que a IA usa para avaliar a qualidade das conversas</strong>. Cada regra tem um peso que influencia o score final de qualidade.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-xs font-bold text-primary">1</span>
                </div>
                <span className="text-sm font-semibold text-foreground">Crie um Playbook</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Dê um nome e um segmento (ex: "Vendas", "Suporte", "Clinica"). O playbook começa como rascunho.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-xs font-bold text-primary">2</span>
                </div>
                <span className="text-sm font-semibold text-foreground">Adicione Regras</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Cada regra tem um <strong>tipo</strong> (Abertura, Qualificacao, Proposta de Valor, CTA, Contorno de Objecao, Follow-up), um <strong>texto</strong> descrevendo o comportamento esperado, um <strong>peso</strong> (importancia no score) e se e obrigatoria.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-xs font-bold text-primary">3</span>
                </div>
                <span className="text-sm font-semibold text-foreground">Publique</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Clique em <strong>Publicar selecionado</strong> para ativar o playbook. A partir dai, a IA usara essas regras como criterio ao analisar conversas.
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
              <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-xs text-muted-foreground"><strong>Tipo</strong> classifica em qual etapa do atendimento a regra se aplica.</p>
            </div>
            <div className="flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
              <Scale className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-xs text-muted-foreground"><strong>Peso</strong> define o quanto essa regra impacta no score de qualidade (0-100).</p>
            </div>
            <div className="flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-xs text-muted-foreground"><strong>Obrigatoria</strong> significa que a ausencia dessa regra impacta negativamente o score.</p>
            </div>
          </div>
        </div>
      )}

      {canManage && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="mb-3 text-lg font-semibold text-foreground">Novo Playbook</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <input
              type="text"
              value={newPlaybookName}
              onChange={(event) => setNewPlaybookName(event.target.value)}
              placeholder="Nome do playbook"
              className="rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/35"
            />
            <input
              type="text"
              value={newPlaybookSegment}
              onChange={(event) => setNewPlaybookSegment(event.target.value)}
              placeholder="Segmento (ex.: clinica)"
              className="rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/35"
            />
            <Button onClick={() => createPlaybookMutation.mutate()} disabled={createPlaybookMutation.isPending}>
              {createPlaybookMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Criar playbook
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card lg:col-span-1">
          <div className="border-b border-border px-4 py-3">
            <h3 className="font-semibold text-foreground">Playbooks da empresa</h3>
          </div>
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Carregando...</div>
          ) : !playbooks || playbooks.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">Nenhum playbook encontrado.</div>
          ) : (
            <div className="space-y-1 p-2">
              {playbooks.map((playbook) => (
                <button
                  key={playbook.id}
                  type="button"
                  onClick={() => setSelectedPlaybookId(playbook.id)}
                  className={cn(
                    'w-full rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                    playbook.id === selectedPlaybookId
                      ? 'border-primary/25 bg-accent'
                      : 'border-border hover:bg-muted',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-foreground">{playbook.name}</p>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        playbook.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {playbook.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{playbook.segment}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card lg:col-span-2">
          <div className="border-b border-border px-4 py-3">
            <h3 className="font-semibold text-foreground">
              {selectedPlaybook ? `Regras - ${selectedPlaybook.name}` : 'Selecione um playbook'}
            </h3>
          </div>

          {!selectedPlaybook ? (
            <div className="p-6 text-sm text-muted-foreground">Escolha um playbook para editar as regras.</div>
          ) : (
            <div className="space-y-4 p-4">
              {canManage && (
                <div className="rounded-xl border border-border bg-muted p-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <select
                      value={newRuleType}
                      onChange={(event) => setNewRuleType(event.target.value as PlaybookRuleType)}
                      className="rounded-lg border border-border px-2 py-2 text-sm"
                    >
                      {RULE_TYPES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>

                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={newRuleWeight}
                      onChange={(event) => setNewRuleWeight(Number(event.target.value))}
                      className="rounded-lg border border-border px-2 py-2 text-sm"
                      placeholder="Peso"
                    />

                    <label className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={newRuleRequired}
                        onChange={(event) => setNewRuleRequired(event.target.checked)}
                      />
                      Obrigatoria
                    </label>

                    <Button onClick={() => createRuleMutation.mutate()} disabled={createRuleMutation.isPending}>
                      {createRuleMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                      Adicionar regra
                    </Button>
                  </div>
                  <textarea
                    value={newRuleText}
                    onChange={(event) => setNewRuleText(event.target.value)}
                    rows={3}
                    placeholder="Texto da regra/checklist"
                    className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/35"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-muted/50 p-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_180px_180px_180px]">
                <label className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
                  <span className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Search className="h-3.5 w-3.5" />
                    Buscar regra
                  </span>
                  <input
                    type="text"
                    value={ruleSearch}
                    onChange={(event) => setRuleSearch(event.target.value)}
                    placeholder="Buscar por texto ou tag"
                    className="w-full bg-transparent outline-none"
                  />
                </label>

                <label className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">Tipo</span>
                  <select
                    value={ruleFilterType}
                    onChange={(event) => setRuleFilterType(event.target.value as 'all' | PlaybookRuleType)}
                    className="w-full bg-transparent outline-none"
                  >
                    <option value="all">Todos os tipos</option>
                    {RULE_TYPES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">Obrigatoriedade</span>
                  <select
                    value={ruleFilterRequired}
                    onChange={(event) => setRuleFilterRequired(event.target.value as 'all' | 'required' | 'optional')}
                    className="w-full bg-transparent outline-none"
                  >
                    <option value="all">Todas</option>
                    <option value="required">Obrigatorias</option>
                    <option value="optional">Opcionais</option>
                  </select>
                </label>

                <label className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">Faixa de peso</span>
                  <select
                    value={ruleWeightRange}
                    onChange={(event) => setRuleWeightRange(event.target.value as (typeof RULE_WEIGHT_FILTERS)[number]['value'])}
                    className="w-full bg-transparent outline-none"
                  >
                    {RULE_WEIGHT_FILTERS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {!rules || rules.length === 0 ? (
                <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
                  Este playbook ainda nao possui regras.
                </div>
              ) : filteredRules.length === 0 ? (
                <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
                  Nenhuma regra encontrada com os filtros atuais.
                </div>
              ) : (
                <div className="space-y-2">
                  {canManage && (
                    <p className="text-xs text-muted-foreground">
                      {isRuleFilterActive
                        ? 'Limpe os filtros para habilitar o drag and drop de reordenacao.'
                        : 'Arraste os cards pela alca \"Drag\" para reordenar as regras.'}
                    </p>
                  )}
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleRuleDragEnd}>
                    <SortableContext items={filteredRules.map((rule) => rule.id)} strategy={verticalListSortingStrategy}>
                      {filteredRules.map((rule) => {
                        const isEditing = editingRuleId === rule.id;

                        return (
                          <SortableRuleCard
                            key={rule.id}
                            rule={rule}
                            canManage={canManage}
                            isEditing={isEditing}
                            isReorderEnabled={!isRuleFilterActive && !reorderRulesMutation.isPending}
                            isDeletePending={deleteRuleMutation.isPending}
                            onEdit={startEditingRule}
                            onDelete={setRulePendingDelete}
                          >
                            {isEditing ? (
                              <div className="space-y-3">
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                                  <select
                                    value={editRuleType}
                                    onChange={(event) => setEditRuleType(event.target.value as PlaybookRuleType)}
                                    className="rounded-lg border border-border px-2 py-2 text-sm"
                                  >
                                    {RULE_TYPES.map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>

                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={editRuleWeight}
                                    onChange={(event) => setEditRuleWeight(Number(event.target.value))}
                                    className="rounded-lg border border-border px-2 py-2 text-sm"
                                  />

                                  <label className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-2 text-sm">
                                    <input
                                      type="checkbox"
                                      checked={editRuleRequired}
                                      onChange={(event) => setEditRuleRequired(event.target.checked)}
                                    />
                                    Obrigatoria
                                  </label>
                                </div>

                                <textarea
                                  value={editRuleText}
                                  onChange={(event) => setEditRuleText(event.target.value)}
                                  rows={3}
                                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/35"
                                />

                                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                                  <Button type="button" variant="outline" onClick={cancelEditingRule}>
                                    Cancelar
                                  </Button>
                                  <Button type="button" onClick={() => updateRuleMutation.mutate()} disabled={updateRuleMutation.isPending}>
                                    {updateRuleMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pencil className="mr-2 h-4 w-4" />}
                                    Salvar regra
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm text-foreground">{rule.rule_text}</p>
                            )}
                          </SortableRuleCard>
                        );
                      })}
                    </SortableContext>
                  </DndContext>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {rulePendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Excluir regra</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Esta acao remove a regra do playbook selecionado.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
                onClick={() => setRulePendingDelete(null)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3 text-sm text-foreground">
              {rulePendingDelete.rule_text}
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setRulePendingDelete(null)}>
                Cancelar
              </Button>
              <Button
                type="button"
                className="bg-red-600 text-white hover:bg-red-700"
                onClick={() => deleteRuleMutation.mutate(rulePendingDelete.id)}
                disabled={deleteRuleMutation.isPending}
              >
                {deleteRuleMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Confirmar exclusao
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
