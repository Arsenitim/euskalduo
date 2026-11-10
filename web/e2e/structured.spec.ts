import { expect, test } from '@playwright/test';
import type { HomeworkSet } from '../src/types';

const topic: HomeworkSet = {
  id: 'esaldiak', kind: 'topic', title: 'Esaldiak', receivedOn: null, description: null, sample: false, groups: [],
  entries: [
    {
      id: 's1', type: 'sentence', basque: 'Gu ere ikasleak gara, eta zuek ere bai.', translations: { es: ['Nosotros también somos alumnos, y vosotros también.'] },
      sentence: { tiles: ['gu', 'ere', 'ikasleak', 'gara,', 'eta', 'zuek', 'ere', 'bai', '.'], alternatives: [], distractors: [] },
      note: null, group: null, emoji: null, image: null,
    },
    {
      id: 'g1', type: 'grammar', basque: 'Ni ikaslea naiz.', translations: { es: ['Yo soy alumno.'] },
      grammar: { text: 'Ni ikaslea ___.', answers: ['naiz'], distractors: ['da', 'gara'] },
      note: 'ni → naiz', group: null, emoji: null, image: null,
    },
  ],
};

test('sentence building (with a repeated tile) and grammar gaps are checked against curated answers', async ({ page }) => {
  await page.route('**/api/public/content', (r) => r.fulfill({ json: { schemaVersion: 2, sets: [topic], stories: [], exams: [] } }));
  await page.route('**/api/public/stats', (r) => r.fulfill({ json: {} }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/practicar?modo=tema&id=esaldiak');
  const seen = new Set<string>();
  for (let n = 0; n < 8 && seen.size < 2; n++) {
    const card = page.locator('.question-card');
    const title = await card.locator('.prompt-title').innerText();
    if (title === 'Forma la frase') {
      seen.add('sentence');
      for (const tile of topic.entries[0]!.sentence!.tiles) {
        await card.locator('.tiles .tile:not(.is-used)', { hasText: new RegExp(`^${tile.replace('.', '\\.')}$`) }).first().click();
      }
      await page.screenshot({ path: 'test-results/sentence-build.png', fullPage: true });
      await card.getByRole('button', { name: 'Comprobar' }).click();
      await expect(page.locator('.feedback-right')).toBeVisible();
    } else {
      expect(title).toBe('Elige la palabra que falta');
      seen.add('grammar');
      await expect(card.locator('.prompt-sentence')).toHaveText(/Ni ikaslea\s*___\s*\./);
      await card.getByRole('button', { name: /da$/ }).click();
      await expect(page.locator('.feedback-wrong')).toContainText('Ni ikaslea naiz.');
      await expect(card.locator('.gap-filled')).toHaveText('naiz');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.getByRole('button', { name: /Siguiente/ }).click();
  }
  expect([...seen].sort()).toEqual(['grammar', 'sentence']);
});
