interface Env {
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_ANON_KEY: string;
  VITE_ENABLE_DEMO_DATA: boolean;
  VITE_DEMO_COMPANY_ID: string;
  isConfigured: boolean;
}

function getEnv(): Env {
  const url = import.meta.env.VITE_SUPABASE_URL ?? '';
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
  const enableDemoData = String(import.meta.env.VITE_ENABLE_DEMO_DATA ?? '').toLowerCase() === 'true';
  const demoCompanyId = import.meta.env.VITE_DEMO_COMPANY_ID ?? '';
  const isConfigured = Boolean(url && key && !url.includes('your-project'));

  return {
    VITE_SUPABASE_URL: url || 'https://placeholder.supabase.co',
    VITE_SUPABASE_ANON_KEY: key || 'placeholder-key',
    VITE_ENABLE_DEMO_DATA: enableDemoData,
    VITE_DEMO_COMPANY_ID: demoCompanyId,
    isConfigured,
  };
}

export const env = getEnv();
