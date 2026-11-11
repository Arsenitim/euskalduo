import { expect, test, type Locator, type Page } from '@playwright/test';

// A Pixel 8 in portrait with Chrome's address bar and Android's navigation
// showing: 412×780 CSS pixels are left for the page.
test.use({ viewport: { width: 412, height: 780 }, isMobile: true, hasTouch: true });

/** The whole button is on screen, without scrolling. */
async function expectWithinScreen(page: Page, button: Locator) {
  const box = await button.boundingBox();
  const height = page.viewportSize()!.height;
  expect(box, 'button is rendered').not.toBeNull();
  expect(box!.y, 'top edge on screen').toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height, 'bottom edge on screen').toBeLessThanOrEqual(height);
}

test('on a phone, Empezar, every "Siguiente" and the summary buttons are on screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Empezar/ })).toBeVisible();
  await expectWithinScreen(page, page.getByRole('link', { name: /Empezar/ }));
  await page.getByRole('link', { name: /Empezar/ }).click();

  // The lesson has the screen to itself: no site menu.
  await expect(page.getByRole('navigation', { name: 'Principal' })).toHaveCount(0);

  let checked = 0;
  for (let i = 0; i < 25; i++) {
    if (await page.getByRole('heading', { name: '¡Ronda terminada!' }).isVisible()) break;
    const card = page.locator('.question-card');
    if (await card.locator('.story-block').count()) {
      await card.getByRole('button', { name: /Saltar la historia|Seguir/ }).first().click();
      continue;
    }
    if (await card.locator('.options').count()) await card.locator('.option').first().click();
    else if (await card.getByRole('button', { name: 'No lo sé' }).count()) await card.getByRole('button', { name: 'No lo sé' }).click();
    else if (await card.locator('.order-sequence').count()) {
      while (await card.locator('.tiles .order-chip').count()) await card.locator('.tiles .order-chip').first().click();
      await card.getByRole('button', { name: 'Comprobar' }).click();
    } else {
      await card.locator('input').fill('xyz');
      await card.getByRole('button', { name: 'Comprobar' }).click();
    }
    const next = page.getByRole('button', { name: /Siguiente/ });
    await expect(next).toBeVisible();
    await expectWithinScreen(page, next);
    checked++;
    await next.click();
  }
  expect(checked).toBeGreaterThan(3);

  // The round summary: the next round is one tap away, however many words are listed.
  await expect(page.getByRole('heading', { name: '¡Ronda terminada!' })).toBeVisible();
  await expectWithinScreen(page, page.getByRole('button', { name: 'Otra ronda' }));
  await expectWithinScreen(page, page.getByRole('link', { name: 'Inicio' }));
});
