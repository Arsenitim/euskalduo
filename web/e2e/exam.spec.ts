import { expect, test } from '@playwright/test';
import type { HomeworkSet } from '../src/types';

const iso = (daysFromNow: number) => {
  const now = new Date(Date.now() + daysFromNow * 86_400_000);
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

const examSet: HomeworkSet = { id: 'exam', kind: 'sheet', title: 'Denborazkoak', receivedOn: '2026-09-28',
  description: null, sample: false, groups: [], entries: [
    { id: 'e1', basque: 'GAUR', translations: { es: ['hoy'] }, note: null, group: null, emoji: null, image: null },
    { id: 'e2', basque: 'ATZO', translations: { es: ['ayer'] }, note: null, group: null, emoji: null, image: null },
    { id: 'e3', basque: 'BIHAR', translations: { es: ['mañana'] }, note: null, group: null, emoji: null, image: null },
  ] };
const otherSet: HomeworkSet = { ...examSet, id: 'other', title: 'Otra hoja', receivedOn: null,
  entries: [{ id: 'o1', basque: 'ETXEA', translations: { es: ['casa'] }, note: null, group: null, emoji: null, image: null }] };

const exam = { id: 'exam', title: 'Denborazkoak', examDate: iso(1), setIds: ['exam'] };

test('announces an exam on the home page and drills only its words', async ({ page }) => {
  await page.route('**/api/public/content', (r) => r.fulfill({ json: { schemaVersion: 2, sets: [otherSet, examSet], stories: [], exams: [exam] } }));
  await page.route('**/api/public/stats', (r) => r.fulfill({ json: {} }));
  await page.goto('/#/');
  const card = page.locator('.action-exam');
  await expect(card).toContainText('Preparar el examen');
  await expect(card).toContainText('Examen:');
  await expect(card).toContainText('Denborazkoak');
  await card.click();

  // Exam page: date, word list, practice entry point.
  await expect(page.getByRole('heading', { name: /Examen: Denborazkoak/ })).toBeVisible();
  await expect(page.locator('.word-basque')).toHaveText(['Gaur', 'Atzo', 'Bihar']);
  await page.getByRole('link', { name: '¡A preparar el examen!' }).click();
  await expect(page).toHaveURL(/modo=examen&id=exam/);

  // Every question of the round asks about an exam word, never about the other sheet's
  // (other sets may still appear among the wrong choices, as in any round).
  for (let n = 0; n < 12; n++) {
    if (await page.getByRole('heading', { name: '¡Ronda terminada!' }).isVisible()) break;
    const card = page.locator('.question-card');
    await expect(card.locator('.prompt-basque, .prompt-meaning').first()).toHaveText(/Gaur|Atzo|Bihar|Hoy|Ayer|Mañana/);
    if (await card.locator('.options').count()) {
      await card.locator('.option').first().click();
    } else {
      await card.getByRole('button', { name: 'No lo sé' }).click();
    }
    await page.getByRole('button', { name: /Siguiente/ }).click();
  }
  await expect(page.getByRole('heading', { name: '¡Ronda terminada!' })).toBeVisible();
});

test('an exam in the past is not announced, and its words stay in ordinary practice', async ({ page }) => {
  await page.route('**/api/public/content', (r) => r.fulfill({ json: { schemaVersion: 2, sets: [examSet], stories: [], exams: [{ ...exam, examDate: iso(-1) }] } }));
  await page.route('**/api/public/stats', (r) => r.fulfill({ json: {} }));
  await page.goto('/#/');
  await expect(page.locator('.action-start')).toBeVisible();
  await expect(page.locator('.action-exam')).toHaveCount(0);
});

test('an old exam link (#/examen/<setId>, from a set exam date) still opens the exam', async ({ page }) => {
  // An older server sends the exam date on the set itself.
  const legacy = { ...examSet, kind: 'week', weekStart: '2026-09-28', examDate: iso(2) };
  await page.route('**/api/public/content', (r) => r.fulfill({ json: { schemaVersion: 1, sets: [legacy] } }));
  await page.route('**/api/public/stats', (r) => r.fulfill({ json: {} }));
  await page.goto('/#/examen/exam');
  await expect(page.getByRole('heading', { name: /Examen: Denborazkoak/ })).toBeVisible();
});
