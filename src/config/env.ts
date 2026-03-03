interface Env {
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_ANON_KEY: string;
  isConfigured: boolean;
}

function getEnv(): Env {
  const url = import.meta.env.VITE_SUPABASE_URL ?? '';
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
  const isConfigured = Boolean(url && key && !url.includes('your-project'));

  return {
    VITE_SUPABASE_URL: url || 'https://placeholder.supabase.co',
    VITE_SUPABASE_ANON_KEY: key || 'placeholder-key',
    isConfigured,
  };
}

export const env = getEnv();
