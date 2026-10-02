import { expect, test } from '@playwright/test';
import type { Content } from '../src/types';

for (const kind of ['week', 'topic'] as const) {
  test(`word building in the October 5 ${kind}: choose pieces, feedback and score`, async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const content = await (await request.get('/api/public/content')).json() as Content;
    const set = content.sets.find((s) => s.kind === kind && (kind === 'week' ? s.weekStart === '2026-10-05' && !s.sample : s.title.startsWith('Formación de palabras')))!;
    expect(set).toBeTruthy();
    await page.goto(`/#/${kind === 'topic' ? 'categoria' : 'semana'}/${set.id}`);
    await expect(page.getByRole('heading', { name: set.title })).toBeVisible();
    await page.getByRole('link', { name: '¡A practicar!' }).click();
    const built: string[] = [];
    for (let n = 0; n < 20; n++) {
      if (await page.getByRole('heading', { name: '¡Ronda terminada!' }).isVisible()) break;
      const card = page.locator('.question-card');
      const title = await card.locator('.prompt-title').innerText();
      if (title === 'Construye la palabra') {
        const stem = (await card.locator('.prompt-basque').innerText()).split(' + ')[0];
        const meaning = await card.locator('.prompt-meaning').innerText();
        const entry = set.entries.find((e) => e.formation?.parts[0] === stem && e.translations.es.join(' / ') === meaning)!;
        expect(entry).toBeTruthy();
        built.push(entry.formation!.kind);
        if (built.length === 1) {
          // Exercise the skip path as well as a correct answer; a later retry must appear.
          await card.getByRole('button', { name: 'No lo sé' }).click();
        } else {
          await card.getByRole('button', { name: entry.formation!.parts[1], exact: false }).click();
        }
        await expect(card.getByText(`${entry.formation!.parts.join(' + ')} → ${entry.basque}`, { exact: true })).toBeVisible();
        expect(await card.locator('.option:disabled').count()).toBeGreaterThanOrEqual(2);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.screenshot({ path: `test-results/word-build-${kind}.png`, fullPage: true });
      } else if (await card.locator('.options').count()) {
        await card.locator('.option').first().click();
      } else {
        await card.getByRole('button', { name: 'No lo sé' }).click();
      }
      await expect(page.locator('.feedback')).toBeVisible();
      await page.getByRole('button', { name: /Siguiente/ }).click();
    }
    expect(built.sort()).toEqual(['compound', 'derived']);
    await expect(page.getByRole('heading', { name: '¡Ronda terminada!' })).toBeVisible();
    await expect(page.locator('.stars-big')).toBeVisible();
  });
}
