import { es, type MessageKey } from './es';

const messages: Record<MessageKey, string> = es;

export function t(key: MessageKey, vars: Record<string, string | number> = {}): string {
  return messages[key].replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

const dateFormat = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export function weekLabel(isoDate: string): string {
  return t('weekOf', { date: dateFormat.format(new Date(`${isoDate}T00:00:00Z`)) });
}

export function wordCount(n: number): string {
  return n === 1 ? t('oneWord') : t('words', { count: n });
}
