import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useCompany } from '../contexts/CompanyContext';
import { Book, Plus, Search, Trash2, FileText, Loader2, HelpCircle, X, Database, Lightbulb } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';

interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

export default function KnowledgeBase() {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [search, setSearch] = useState('');
  
  const [newDoc, setNewDoc] = useState({ title: '', content: '' });

  const { data: documents, isLoading } = useQuery<KnowledgeItem[]>({
    queryKey: ['knowledge-base', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('knowledge_base' as any)
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as KnowledgeItem[];
    },
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: async (doc: typeof newDoc) => {
      if (!companyId) throw new Error('Empresa não selecionada');
      const { error } = await supabase
        .from('knowledge_base' as any)
        .insert([{ ...doc, company_id: companyId }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base', companyId] });
      setIsAdding(false);
      setNewDoc({ title: '', content: '' });
      toast.success('Documento adicionado à base de conhecimento');
    },
    onError: (err) => {
      toast.error('Erro ao adicionar documento: ' + err.message);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('knowledge_base' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base', companyId] });
      toast.success('Documento removido');
    }
  });

  const filteredDocs = documents?.filter(d => 
    d.title.toLowerCase().includes(search.toLowerCase()) || 
    d.content.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-foreground flex items-center gap-3">
             <Book className="h-8 w-8 text-primary" />
             Base de Conhecimento
          </h2>
          <p className="text-muted-foreground mt-1">
            Adicione manuais, regras e documentos para orientar a análise da IA (RAG).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowHelp((v) => !v)} className="gap-2 shrink-0">
            <HelpCircle className="h-4 w-4" />
            Como usar
          </Button>
          <Button onClick={() => setIsAdding(true)} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" />
            Novo Documento
          </Button>
        </div>
      </div>

      {showHelp && (
        <div className="rounded-2xl border border-primary/20 bg-accent/40 p-5 relative">
          <button
            type="button"
            onClick={() => setShowHelp(false)}
            className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
            <Book className="h-5 w-5 text-primary" />
            Como funciona a Base de Conhecimento
          </h3>
          <p className="mb-4 text-sm text-muted-foreground">
            A Base de Conhecimento alimenta a IA com <strong>contexto especifico da sua empresa</strong> usando tecnica de RAG (Retrieval Augmented Generation). A IA consulta esses documentos ao analisar conversas para entender as regras e o negocio.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-xs font-bold text-primary">1</span>
                </div>
                <span className="text-sm font-semibold text-foreground">Cadastre documentos</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Clique em <strong>Novo Documento</strong> e informe um titulo e o conteudo. Exemplos: "Politica de Reembolso", "Script de Vendas", "Regras de Atendimento".
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-xs font-bold text-primary">2</span>
                </div>
                <span className="text-sm font-semibold text-foreground">A IA aprende</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Ao analisar uma conversa, a IA busca automaticamente os documentos relevantes da base para contextualizar a avaliacao com as regras da sua empresa.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-xs font-bold text-primary">3</span>
                </div>
                <span className="text-sm font-semibold text-foreground">Analise mais precisa</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Quanto mais documentos relevantes voce adicionar, mais precisa e contextualizada sera a avaliacao de qualidade das conversas.
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-xs text-muted-foreground">Scripts de vendas, roteiros de atendimento, politicas da empresa.</p>
            </div>
            <div className="flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
              <Database className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-xs text-muted-foreground">Perguntas frequentes, objecoes comuns e como contorna-las.</p>
            </div>
            <div className="flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-xs text-muted-foreground">Quanto mais especifico e detalhado o conteudo, melhor a analise da IA.</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 bg-card p-2 rounded-xl border shadow-sm">
        <Search className="ml-2 h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="Buscar na base..." 
          className="border-0 focus-visible:ring-0" 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isAdding && (
        <Card className="border-primary/25 shadow-lg animate-in fade-in slide-in-from-top-2">
          <CardHeader>
            <CardTitle className="text-lg">Cadastrar Documento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Título do Documento</label>
              <Input 
                 placeholder="Ex: Política de Reembolso, Script de Vendas..." 
                 value={newDoc.title}
                 onChange={(e) => setNewDoc(prev => ({ ...prev, title: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Conteúdo (Contexto para a IA)</label>
              <Textarea 
                placeholder="Cole aqui as regras ou informações que a IA deve saber..." 
                className="min-h-[200px]"
                value={newDoc.content}
                onChange={(e) => setNewDoc(prev => ({ ...prev, content: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setIsAdding(false)}>Cancelar</Button>
              <Button 
                onClick={() => createMutation.mutate(newDoc)}
                disabled={!newDoc.title || !newDoc.content || createMutation.isPending}
              >
                {createMutation.isPending ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
                Salvar na Base
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          [...Array(3)].map((_, i) => (
             <div key={i} className="h-40 bg-muted animate-pulse rounded-2xl" />
          ))
        ) : filteredDocs?.length === 0 ? (
          <div className="col-span-full py-12 text-center bg-muted rounded-2xl border-2 border-dashed border-border">
             <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
             <p className="text-muted-foreground font-medium">Nenhum documento encontrado.</p>
             <p className="text-sm text-muted-foreground">Adicione seu primeiro guia de treinamento acima.</p>
          </div>
        ) : (
          filteredDocs?.map(doc => (
            <Card key={doc.id} className="group hover:border-primary/35 transition-all hover:shadow-md cursor-default">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardTitle className="text-md font-bold truncate pr-6">{doc.title}</CardTitle>
                <button 
                  onClick={() => deleteMutation.mutate(doc.id)}
                  className="text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground line-clamp-4 leading-relaxed">
                  {doc.content}
                </p>
                <div className="pt-4 flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground font-medium bg-muted px-2 py-0.5 rounded-full">
                    {new Date(doc.created_at).toLocaleDateString('pt-BR')}
                  </span>
                  <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
