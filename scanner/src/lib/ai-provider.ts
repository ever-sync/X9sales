import Anthropic from '@anthropic-ai/sdk';
import { config, supabase } from '../config';

export type AIProviderKind = 'anthropic' | 'openai' | 'gemini' | 'grok' | 'deepseek' | 'custom';

interface StoredAIProviderConfig {
  id?: unknown;
  provider?: unknown;
  label?: unknown;
  api_key?: unknown;
  model?: unknown;
  base_url?: unknown;
  enabled?: unknown;
  order?: unknown;
}

interface OpenAIChatCompletionResponse {
  model?: string;
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
}

interface ResolvedProvider {
  id: string;
  provider: AIProviderKind;
  label: string;
  apiKey: string;
  model: string;
  baseUrl: string | null;
  order: number;
}

interface CompanyProviderCache {
  expiresAt: number;
  providers: ResolvedProvider[];
}

type GenerateParams = {
  companyId: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  defaultModel: string;
  taskLabel: string;
};

type GenerateResult = {
  text: string;
  modelUsed: string;
  providerUsed: string;
};

const PROVIDER_CACHE_TTL_MS = 60_000;

const DEFAULT_MODELS: Record<AIProviderKind, string> = {
  anthropic: 'claude-haiku-4-5-20251001',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.5-flash',
  grok: 'grok-3-mini',
  deepseek: 'deepseek-chat',
  custom: 'gpt-4o-mini',
};

const DEFAULT_BASE_URLS: Partial<Record<AIProviderKind, string>> = {
  openai: 'https://api.openai.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  grok: 'https://api.x.ai/v1',
  deepseek: 'https://api.deepseek.com/v1',
};

const companyProviderCache = new Map<string, CompanyProviderCache>();

function sanitizeText(value: unknown, maxLength = 200): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function normalizeProvider(value: unknown): AIProviderKind | null {
  const candidate = sanitizeText(value, 40).toLowerCase();
  const allowed: AIProviderKind[] = ['anthropic', 'openai', 'gemini', 'grok', 'deepseek', 'custom'];
  return allowed.includes(candidate as AIProviderKind) ? (candidate as AIProviderKind) : null;
}

function normalizeOrder(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed));
  }
  return fallback;
}

function extractTextFromOpenAIContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  const fragments = content
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      const record = part as Record<string, unknown>;
      if (typeof record.text === 'string') return record.text;
      if (record.type === 'text' && typeof record.content === 'string') return record.content;
      return '';
    })
    .filter((item) => item.trim().length > 0);

  return fragments.join('\n');
}

function parseStoredProviders(value: unknown): ResolvedProvider[] {
  if (!Array.isArray(value)) return [];

  const providers: ResolvedProvider[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!item || typeof item !== 'object') continue;

    const record = item as StoredAIProviderConfig;
    const provider = normalizeProvider(record.provider);
    if (!provider) continue;

    const apiKey = sanitizeText(record.api_key, 400);
    if (!apiKey) continue;

    const label = sanitizeText(record.label, 80) || `${provider.toUpperCase()} #${index + 1}`;
    const model = sanitizeText(record.model, 120) || DEFAULT_MODELS[provider];
    const enabled = record.enabled !== false;
    if (!enabled) continue;

    const baseUrlCandidate = sanitizeText(record.base_url, 200);
    const baseUrl =
      provider === 'anthropic'
        ? null
        : (baseUrlCandidate || DEFAULT_BASE_URLS[provider] || null);

    if (provider !== 'anthropic' && !baseUrl) continue;

    providers.push({
      id: sanitizeText(record.id, 120) || `${provider}-${index + 1}`,
      provider,
      label,
      apiKey,
      model,
      baseUrl,
      order: normalizeOrder(record.order, index),
    });
  }

  return providers.sort((a, b) => a.order - b.order);
}

async function loadCompanyProviders(companyId: string): Promise<ResolvedProvider[]> {
  const cached = companyProviderCache.get(companyId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.providers;
  }

  const { data, error } = await supabase
    .schema('app')
    .from('companies')
    .select('settings')
    .eq('id', companyId)
    .maybeSingle();

  if (error) {
    throw new Error(`[AIProvider] Failed to load company settings: ${error.message}`);
  }

  const settings =
    data && typeof data === 'object' && 'settings' in data
      ? (data as { settings?: unknown }).settings
      : null;

  const providers = settings && typeof settings === 'object'
    ? parseStoredProviders((settings as { ai_providers?: unknown }).ai_providers)
    : [];

  const fallbackProviders = providers.length > 0
    ? providers
    : (config.anthropicApiKey
      ? [{
          id: 'fallback-anthropic-env',
          provider: 'anthropic' as const,
          label: 'Anthropic (env)',
          apiKey: config.anthropicApiKey,
          model: DEFAULT_MODELS.anthropic,
          baseUrl: null,
          order: 0,
        }]
      : []);

  companyProviderCache.set(companyId, {
    expiresAt: Date.now() + PROVIDER_CACHE_TTL_MS,
    providers: fallbackProviders,
  });

  return fallbackProviders;
}

async function callAnthropic(provider: ResolvedProvider, params: GenerateParams): Promise<GenerateResult> {
  const client = new Anthropic({ apiKey: provider.apiKey });
  const response = await client.messages.create({
    model: provider.model || params.defaultModel,
    max_tokens: params.maxTokens,
    system: params.systemPrompt,
    messages: [{ role: 'user', content: params.userPrompt }],
  });

  const content = response.content[0];
  if (!content || content.type !== 'text') {
    throw new Error('Resposta nao textual do provedor Anthropic.');
  }

  return {
    text: content.text,
    modelUsed: provider.model || params.defaultModel,
    providerUsed: provider.label,
  };
}

async function callOpenAICompatible(provider: ResolvedProvider, params: GenerateParams): Promise<GenerateResult> {
  if (!provider.baseUrl) {
    throw new Error('Base URL ausente para provedor OpenAI-compat.');
  }

  const endpoint = `${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: provider.model || params.defaultModel,
      max_tokens: params.maxTokens,
      temperature: 0.2,
      messages: [
        { role: 'system', content: params.systemPrompt },
        { role: 'user', content: params.userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 300)}`);
  }

  const payload = (await response.json()) as OpenAIChatCompletionResponse;
  const content = extractTextFromOpenAIContent(payload.choices?.[0]?.message?.content);
  if (!content.trim()) {
    throw new Error('Resposta vazia no campo message.content.');
  }

  return {
    text: content,
    modelUsed: sanitizeText(payload.model, 120) || provider.model || params.defaultModel,
    providerUsed: provider.label,
  };
}

export async function hasAnyAIProviderConfigured(companyId: string): Promise<boolean> {
  const providers = await loadCompanyProviders(companyId);
  return providers.length > 0;
}

export async function generateTextWithCompanyProviders(params: GenerateParams): Promise<GenerateResult> {
  const providers = await loadCompanyProviders(params.companyId);
  if (!providers.length) {
    throw new Error(
      `[${params.taskLabel}] Nenhum provedor de IA ativo encontrado. Configure em settings.ai_providers ou ANTHROPIC_API_KEY.`,
    );
  }

  const failures: string[] = [];
  for (const provider of providers) {
    try {
      if (provider.provider === 'anthropic') {
        return await callAnthropic(provider, params);
      }
      return await callOpenAICompatible(provider, params);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${provider.label}: ${message}`);
    }
  }

  throw new Error(`[${params.taskLabel}] Todos os provedores falharam. ${failures.join(' | ')}`);
}
