import { createClient } from '@supabase/supabase-js';
import { env } from '../../config/env';

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
