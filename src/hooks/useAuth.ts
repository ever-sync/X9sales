import { useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { clearStoredSupabaseSession, isInvalidRefreshTokenError, supabase } from '../integrations/supabase/client';

interface UseAuthReturn {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    options?: {
      data?: Record<string, unknown>;
    },
  ) => Promise<{ error: Error | null; user: User | null; session: Session | null }>;
  signOut: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const applySession = (nextSession: Session | null) => {
      if (!active) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    };

    const resetBrokenSession = async () => {
      await clearStoredSupabaseSession();
      applySession(null);
    };

    void supabase.auth.getSession()
      .then(async ({ data: { session: s }, error }) => {
        if (error) {
          if (isInvalidRefreshTokenError(error)) {
            await resetBrokenSession();
            return;
          }
          applySession(null);
          return;
        }

        applySession(s);
      })
      .catch(async (error) => {
        if (isInvalidRefreshTokenError(error)) {
          await resetBrokenSession();
          return;
        }

        applySession(null);
      });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      applySession(s);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? new Error(error.message) : null };
  };

  const signUp = async (
    email: string,
    password: string,
    options?: {
      data?: Record<string, unknown>;
    },
  ) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: options?.data,
      },
    });
    return {
      error: error ? new Error(error.message) : null,
      user: data.user ?? null,
      session: data.session ?? null,
    };
  };

  const signOut = async () => {
    await clearStoredSupabaseSession();
  };

  return { user, session, loading, signIn, signUp, signOut };
}
