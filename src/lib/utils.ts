import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatSeconds(seconds: number | null): string {
  if (seconds == null) return '--';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h${mins > 0 ? ` ${mins}min` : ''}`;
}

export function formatPercent(value: number | null): string {
  if (value == null) return '--';
  return `${value.toFixed(1)}%`;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatDateTime(date: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function channelLabel(channel: string): string {
  const labels: Record<string, string> = {
    whatsapp: 'WhatsApp',
    email: 'E-mail',
    call: 'Telefone',
    chat: 'Chat',
    instagram: 'Instagram',
    messenger: 'Messenger',
    telegram: 'Telegram',
  };
  return labels[channel] ?? channel;
}

export function severityColor(severity: string): string {
  const colors: Record<string, string> = {
    low: 'text-primary bg-accent',
    medium: 'text-primary bg-accent',
    high: 'text-primary bg-accent',
    critical: 'text-red-600 bg-red-50',
  };
  return colors[severity] ?? 'text-muted-foreground bg-muted';
}
