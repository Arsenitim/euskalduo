import { es, type MessageKey } from './es';

const messages: Record<MessageKey, string> = es;

export function t(key: MessageKey, vars: Record<string, string | number> = {}): string {
  return messages[key].replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

const dateFormat = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** "Hoja recibida el 2 de noviembre de 2026": provenance only. */
export function receivedLabel(isoDate: string): string {
  return t('receivedOn', { date: dateFormat.format(new Date(`${isoDate}T00:00:00Z`)) });
}

/** "0:34"-style length of a story, from the measured audio. */
export function durationLabel(ms: number | null): string | null {
  if (ms === null || ms <= 0) return null;
  const total = Math.round(ms / 1000);
  return total >= 60 ? t('storyMinutes', { m: Math.floor(total / 60), s: total % 60 }) : t('storySeconds', { s: total });
}

export function difficultyLabel(level: number): string {
  return level >= 3 ? t('difficulty3') : level === 2 ? t('difficulty2') : t('difficulty1');
}

const examDateFormat = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** "Examen: lunes, 3 de noviembre" — or "¡El examen es hoy!" on the day itself. */
export function examLabel(isoDate: string, todayIso: string): string {
  return isoDate === todayIso ? t('examToday') : t('examOn', { date: examDateFormat.format(new Date(`${isoDate}T00:00:00Z`)) });
}

export function wordCount(n: number): string {
  return n === 1 ? t('oneWord') : t('words', { count: n });
}
