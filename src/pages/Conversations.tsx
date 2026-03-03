import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useConversations } from '../hooks/useConversations';
import { formatDateTime, channelLabel, cn } from '../lib/utils';
import { MessageSquare, ChevronLeft, ChevronRight } from 'lucide-react';

export default function Conversations() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>('');
  const [channel, setChannel] = useState<string>('');

  const { data, isLoading } = useConversations({
    status: status || undefined,
    channel: channel || undefined,
    page,
  });

  const conversations = data?.data ?? [];
  const totalCount = data?.count ?? 0;
  const pageSize = 20;
  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Conversas</h2>
        <p className="text-muted-foreground mt-1">Explore todas as conversas do time</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1); }}
          className="text-sm border border-border rounded-lg px-3 py-2 focus:ring-2 focus:ring-ring/40 focus:border-primary outline-none"
        >
          <option value="">Todos os status</option>
          <option value="active">Ativas</option>
          <option value="waiting">Aguardando</option>
          <option value="closed">Fechadas</option>
        </select>

        <select
          value={channel}
          onChange={e => { setChannel(e.target.value); setPage(1); }}
          className="text-sm border border-border rounded-lg px-3 py-2 focus:ring-2 focus:ring-ring/40 focus:border-primary outline-none"
        >
          <option value="">Todos os canais</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="email">E-mail</option>
          <option value="call">Telefone</option>
          <option value="chat">Chat</option>
          <option value="instagram">Instagram</option>
        </select>

        <span className="text-sm text-muted-foreground ml-auto">
          {totalCount} conversa{totalCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* List */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-muted rounded mb-2 animate-pulse" />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            Nenhuma conversa encontrada
          </div>
        ) : (
          <div className="divide-y divide-border">
            {conversations.map(conv => (
              <Link
                key={conv.id}
                to={`/conversations/${conv.id}`}
                className="px-6 py-4 flex items-center justify-between hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 bg-muted rounded-full flex items-center justify-center">
                    <MessageSquare className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {conv.customer?.name ?? conv.customer?.phone ?? 'Cliente'}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{channelLabel(conv.channel)}</span>
                      {conv.agent && (
                        <span className="text-xs text-muted-foreground">— {conv.agent.name}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn(
                    'text-xs px-2 py-0.5 rounded-full font-medium',
                    conv.status === 'active' ? 'bg-accent text-primary' :
                    conv.status === 'waiting' ? 'bg-accent text-primary' :
                    conv.status === 'closed' ? 'bg-muted text-muted-foreground' :
                    'bg-accent text-primary'
                  )}>
                    {conv.status}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {conv.started_at ? formatDateTime(conv.started_at) : '—'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm text-muted-foreground">
            Pagina {page} de {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
