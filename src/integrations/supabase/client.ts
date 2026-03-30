import { createClient } from '@supabase/supabase-js';
import { env } from '../../config/env';

const projectRef = (() => {
  try {
    return new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0] ?? 'local';
  } catch {
    return 'local';
  }
})();

export const SUPABASE_AUTH_STORAGE_KEY = `sb-${projectRef}-auth-token`;

export const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
    db: {
      schema: 'app',
    },
  }
);

export function isInvalidRefreshTokenError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';

  return /invalid refresh token|refresh token not found/i.test(message);
}

export async function clearStoredSupabaseSession(): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // Ignore local cleanup failures and remove storage manually below.
  }

  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
    window.localStorage.removeItem(`${SUPABASE_AUTH_STORAGE_KEY}-code-verifier`);
  }
}

// Client for raw schema (if needed)
export const supabaseRaw = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      storage: localStorage,
      persistSession: false,
      autoRefreshToken: false,
      storageKey: 'sb-raw-auth-token',
    },
    db: {
      schema: 'raw',
    },
  }
);
