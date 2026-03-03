import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../integrations/supabase/client';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/card';
import { toast } from 'sonner';
import { Building2, ArrowRight, Loader2, LogOut } from 'lucide-react';

export default function RegisterBusiness() {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Auto-generate slug from name
  const handleNameChange = (val: string) => {
    setName(val);
    const generatedSlug = val
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
      toast.error('Por favor, preencha todos os campos.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      console.log('[RegisterBusiness] calling RPC register_company', { name, slug });
      const { data, error } = await supabase.rpc('register_company', {
        p_name: name,
        p_slug: slug,
      });
      console.log('[RegisterBusiness] RPC result:', { data, error });

      if (error) throw error;

      toast.success('Empresa cadastrada com sucesso!');
      localStorage.removeItem('monitoraia_company_id');
      window.location.href = '/';
    } catch (error: any) {
      const msg = error?.message || JSON.stringify(error) || 'Erro desconhecido';
      console.error('[RegisterBusiness] error:', msg, error);
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted p-4">
      <Card className="max-w-md w-full shadow-lg border-border">
        <CardHeader className="text-center space-y-1">
          <div className="w-12 h-12 bg-accent text-primary rounded-xl flex items-center justify-center mx-auto mb-2">
            <Building2 className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">Cadastre sua Empresa</CardTitle>
          <CardDescription>
            Configure sua organização para começar a monitorar seus atendimentos.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 pt-4">
            {errorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 break-all">
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
                Slug (Identificador Único)
              </label>
              <Input
                id="slug"
                placeholder="ex-minha-loja"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
              />
              <p className="text-[10px] text-muted-foreground italic">
                * Este identificador será usado em URLs e integrações.
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col pt-2">
            <Button 
              type="submit" 
              className="w-full bg-primary hover:bg-primary/90 h-11"
              disabled={isSubmitting}
            >
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
              className="mt-2 text-red-400 hover:text-red-600 text-xs gap-1.5"
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
