import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../hooks/useAuth';
import type { Company, AppRole, CompanySettings } from '../types';

interface CompanyContextValue {
  companyId: string | null;
  company: Company | null;
  companies: Company[];
  role: AppRole | null;
  setCompanyId: (id: string) => void;
  isLoading: boolean;
}

const CompanyContext = createContext<CompanyContextValue>({
  companyId: null,
  company: null,
  companies: [],
  role: null,
  setCompanyId: () => {},
  isLoading: true,
});

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [roleMap, setRoleMap] = useState<Record<string, AppRole>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (authLoading) {
      setIsLoading(true);
      return () => {
        cancelled = true;
      };
    }

    if (!user) {
      setCompanies([]);
      setCompanyId(null);
      setRoleMap({});
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    type CompanyRow = {
      company_id: string;
      role: string;
      company_name: string;
      slug: string;
      settings: CompanySettings;
      created_at: string;
    };

    const applyRows = (rows: CompanyRow[]) => {
      if (cancelled) return;

      const comps: Company[] = rows.map(r => ({
        id: r.company_id,
        name: r.company_name,
        slug: r.slug,
        settings: r.settings,
        created_at: r.created_at,
      }));

      const roles: Record<string, AppRole> = {};
      rows.forEach(r => {
        if (r.company_id && r.role) roles[r.company_id] = r.role as AppRole;
      });

      setCompanies(comps);
      setRoleMap(roles);

      const stored = localStorage.getItem('monitoraia_company_id');
      const match = comps.find(c => c.id === stored);
      setCompanyId(match?.id ?? comps[0]?.id ?? null);
      setIsLoading(false);
    };

    const loadCompanies = async () => {
      setIsLoading(true);

      const { data, error } = await supabase.rpc('get_my_companies');

      if (!error) {
        applyRows((data ?? []) as CompanyRow[]);
        return;
      }

      console.error('[CompanyContext] get_my_companies error:', error);

      // Fallback for environments where RPC migration hasn't been applied yet.
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('company_members')
        .select(`
          company_id,
          role,
          company:companies!inner(
            id,
            name,
            slug,
            settings,
            created_at
          )
        `)
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (fallbackError) {
        console.error('[CompanyContext] fallback company_members query error:', fallbackError);
        if (cancelled) return;
        setCompanies([]);
        setCompanyId(null);
        setRoleMap({});
        setIsLoading(false);
        return;
      }

      const rows: CompanyRow[] = ((fallbackData ?? []) as any[])
        .map(row => {
          const company = row.company;
          if (!row.company_id || !row.role || !company?.name) return null;
          return {
            company_id: row.company_id,
            role: row.role,
            company_name: company.name,
            slug: company.slug,
            settings: company.settings,
            created_at: company.created_at,
          } as CompanyRow;
        })
        .filter((row): row is CompanyRow => !!row);

      applyRows(rows);
    };

    loadCompanies();

    return () => {
      cancelled = true;
    };
  }, [user?.id, authLoading]);

  const handleSetCompanyId = (id: string) => {
    setCompanyId(id);
    localStorage.setItem('monitoraia_company_id', id);
  };

  const company = companies.find(c => c.id === companyId) ?? null;
  const role = companyId ? (roleMap[companyId] ?? null) : null;

  return (
    <CompanyContext.Provider
      value={{
        companyId,
        company,
        companies,
        role,
        setCompanyId: handleSetCompanyId,
        isLoading,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  return useContext(CompanyContext);
}
