import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowRight, Loader2, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/card';

const SIGNUP_PROFILE_STORAGE_KEY = 'monitoraia_signup_profile';

function sanitizeDigits(value: string) {
  return value.replace(/\D/g, '');
}

function formatCnpj(value: string) {
  return sanitizeDigits(value)
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export default function RegisterBusiness() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const rawLocal = localStorage.getItem(SIGNUP_PROFILE_STORAGE_KEY);
    const localSignup = rawLocal ? JSON.parse(rawLocal) : null;
    const metadata = user?.user_metadata ?? {};

    const nextName =
      (typeof metadata.company_name_seed === 'string' && metadata.company_name_seed) ||
      localSignup?.companyName ||
      '';
    const nextSlug =
      (typeof metadata.company_slug_seed === 'string' && metadata.company_slug_seed) ||
      localSignup?.companySlug ||
      '';
    const nextDocument =
      (typeof metadata.company_document_number === 'string' && metadata.company_document_number) ||
      localSignup?.cnpj ||
      '';

    if (nextName && !name) setName(nextName);
    if (nextSlug && !slug) setSlug(nextSlug);
    if (nextDocument && !documentNumber) setDocumentNumber(formatCnpj(nextDocument));
  }, [documentNumber, name, slug, user]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const handleNameChange = (value: string) => {
    setName(value);
    const generatedSlug = value
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    setSlug(generatedSlug);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !slug) {
      toast.error('Por favor, preencha todos os campos obrigatorios.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const { data, error } = await supabase.rpc('register_company', {
        p_name: name,
        p_slug: slug,
      });

      if (error) throw error;

      const cleanedDocument = sanitizeDigits(documentNumber);
      if (cleanedDocument) {
        const { error: settingsError } = await supabase
          .from('companies')
          .update({
            settings: {
              legal_name: name,
              document_type: 'cnpj',
              document_number: cleanedDocument,
              logo_url: '',
            },
          } as never)
          .eq('id', data as string);

        if (settingsError) throw settingsError;
      }

      toast.success('Empresa cadastrada com sucesso!');
      localStorage.removeItem(SIGNUP_PROFILE_STORAGE_KEY);
      localStorage.setItem('monitoraia_company_id', data as string);
      window.location.href = '/';
    } catch (error: any) {
      const msg = error?.message || JSON.stringify(error) || 'Erro desconhecido';
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-md border-border shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-primary">
            <Building2 className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">Cadastre sua Empresa</CardTitle>
          <CardDescription>Revise os dados iniciais da empresa para concluir o acesso ao workspace.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 pt-4">
            {errorMsg && (
              <div className="break-all rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <strong>Erro:</strong> {errorMsg}
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium text-foreground">
                Nome da Empresa
              </label>
              <Input
                id="name"
                placeholder="Ex: Minha Loja Ltda"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="slug" className="text-sm font-medium text-foreground">
                Slug
              </label>
              <Input
                id="slug"
                placeholder="ex-minha-loja"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
              />
              <p className="text-[10px] italic text-muted-foreground">
                Este identificador sera usado em URLs e integracoes.
              </p>
            </div>
            <div className="space-y-2">
              <label htmlFor="document" className="text-sm font-medium text-foreground">
                CNPJ
              </label>
              <Input
                id="document"
                placeholder="00.000.000/0000-00"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(formatCnpj(e.target.value))}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col pt-2">
            <Button type="submit" className="h-11 w-full bg-primary hover:bg-primary/90" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cadastrando...
                </>
              ) : (
                <>
                  Criar Empresa
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="mt-2 gap-1.5 text-xs text-red-400 hover:text-red-600"
              onClick={handleSignOut}
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair da conta
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
