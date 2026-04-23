import { describe, expect, it } from 'vitest';
import {
  channelLabel,
  formatPercent,
  formatSeconds,
  getMessageDisplayContent,
  normalizePhone,
  stripAgentPrefix,
} from './utils';

describe('utils', () => {
  it('formats durations consistently', () => {
    expect(formatSeconds(null)).toBe('--');
    expect(formatSeconds(42)).toBe('42s');
    expect(formatSeconds(180)).toBe('3min');
    expect(formatSeconds(3900)).toBe('1h 5min');
  });

  it('formats percentages and known channels', () => {
    expect(formatPercent(null)).toBe('--');
    expect(formatPercent(87.456)).toBe('87.5%');
    expect(channelLabel('whatsapp')).toBe('WhatsApp');
    expect(channelLabel('custom-channel')).toBe('custom-channel');
  });

  it('normalizes phone numbers and removes agent-prefixed labels', () => {
    expect(normalizePhone('+55 (11) 91234-5678')).toBe('5511912345678');
    expect(stripAgentPrefix('Marina - Cliente Final', 'Marina')).toBe('Cliente Final');
    expect(stripAgentPrefix('Marina atendimento vip', 'Marina', '5511999999999')).toBe('5511999999999');
    expect(stripAgentPrefix('', 'Marina', 'Cliente fallback')).toBe('Cliente fallback');
  });

  it('derives readable content from message metadata when text is missing', () => {
    expect(getMessageDisplayContent({
      content: '',
      content_type: 'audio',
      metadata: {
        audio: { transcription_status: 'pending' },
      },
    } as never)).toBe('[Audio em transcricao]');

    expect(getMessageDisplayContent({
      content: '[mensagem sem conteudo]',
      content_type: 'text',
      metadata: {
        text: { mediaType: 'image' },
      },
    } as never)).toBe('[Imagem sem legenda]');

    expect(getMessageDisplayContent({
      content: '',
      content_type: 'audio',
      metadata: {
        audio: { text: 'Cliente pediu proposta por email' },
      },
    } as never)).toBe('Cliente pediu proposta por email');
  });
});
