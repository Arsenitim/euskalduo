import type { Exam, HomeworkSet, Story } from '../types';

/** Detail page of a sheet or topic. */
export function setPath(set: HomeworkSet): string {
  return `/tema/${set.id}`;
}

/** Practice of one sheet or topic. */
export function practicePath(set: HomeworkSet): string {
  return `/practicar?modo=tema&id=${set.id}`;
}

/** The personalised mixed lesson ("Empezar"). */
export const LESSON_PATH = '/leccion';

export function examPath(exam: Exam): string {
  return `/examen/${exam.id}`;
}

export function examPracticePath(exam: Exam): string {
  return `/practicar?modo=examen&id=${exam.id}`;
}

export function storyPath(story: Story): string {
  return `/escuchar/${story.id}`;
}

/**
 * Old links (bookmarks, home-screen shortcuts, shared URLs) from the time of
 * homework weeks, mapped to the pages that replace them. Returns null when
 * the path is not an old one.
 */
export function legacyRedirect(pathname: string, search: string): string | null {
  if (pathname === '/semanas' || pathname === '/categorias') return '/temas';
  if (pathname === '/mezclar') return LESSON_PATH;
  const detail = /^\/(?:semana|categoria)\/([a-z0-9_-]{1,40})$/.exec(pathname);
  if (detail) return `/tema/${detail[1]}`;
  if (pathname === '/practicar') {
    const params = new URLSearchParams(search);
    const modo = params.get('modo');
    if (modo === 'mezcla') return LESSON_PATH;
    if ((modo === 'semana' || modo === 'categoria') && params.get('id')) return `/practicar?modo=tema&id=${params.get('id')}`;
  }
  return null;
}
