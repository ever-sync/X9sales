import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookCheck, Loader2, Megaphone, Plus } from 'lucide-react';
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

interface FunctionPayload {
  success?: boolean;
  error?: string;
  [key: string]: unknown;
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
  const canManage = role === 'owner_admin' || role === 'manager';

  const [selectedPlaybookId, setSelectedPlaybookId] = useState('');
  const [newPlaybookName, setNewPlaybookName] = useState('');
  const [newPlaybookSegment, setNewPlaybookSegment] = useState('geral');
  const [newRuleText, setNewRuleText] = useState('');
  const [newRuleType, setNewRuleType] = useState<PlaybookRuleType>('abertura');
  const [newRuleWeight, setNewRuleWeight] = useState(10);
  const [newRuleRequired, setNewRuleRequired] = useState(false);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Playbooks</h2>
          <p className="text-muted-foreground">Padronize atendimento de alta conversao e publique versoes ativas.</p>
        </div>
        {canManage && selectedPlaybookId && (
          <Button onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending}>
            {publishMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Megaphone className="mr-2 h-4 w-4" />}
            Publicar selecionado
          </Button>
        )}
      </div>

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

              {!rules || rules.length === 0 ? (
                <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
                  Este playbook ainda nao possui regras.
                </div>
              ) : (
                <div className="space-y-2">
                  {rules.map((rule) => (
                    <div key={rule.id} className="rounded-xl border border-border bg-card p-3">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                          {rule.rule_type}
                        </span>
                        <span className="text-xs text-muted-foreground">Peso {rule.weight}</span>
                      </div>
                      <p className="text-sm text-foreground">{rule.rule_text}</p>
                      {rule.is_required && (
                        <div className="mt-1 flex items-center gap-1 text-xs font-medium text-primary">
                          <BookCheck className="h-3 w-3" />
                          Regra obrigatoria
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
