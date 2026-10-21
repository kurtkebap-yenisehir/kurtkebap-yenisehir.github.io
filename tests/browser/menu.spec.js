import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://images.unsplash.com/**', (route) => route.abort());
});

test('Dürümler opens first; categories support Turkish search and an empty result', async ({ page }) => {
  await page.goto('/');
  const categories = page.locator('#categories button');
  await expect(categories).toHaveCount(6);
  await expect(categories.first()).toHaveText('Dürümler');
  await expect(page.locator('#category-title')).toHaveText('Dürümler');
  await expect(page.locator('.product-card')).toHaveCount(6);
  for (const category of ['Kebaplar', 'Porsiyonlar', 'Dürümler', 'Hamburgerler', 'Mezeler', 'İçecekler']) {
    await page.getByRole('button', { name: category, exact: true }).click();
    const count = await page.locator('.product-card').count();
    expect(count).toBeGreaterThan(0);
    await expect(page.locator('#product-count')).toHaveText(`${count} ürün`);
  }
  await page.getByRole('searchbox').fill('ciger');
  await expect(page.getByRole('heading', { name: 'Ciğer Dürüm', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ciğer Porsiyon', exact: true })).toBeVisible();
  await page.getByRole('searchbox').fill('olmayanurun123');
  await expect(page.locator('#menu-status')).toContainText('Aradığınız ürün bulunamadı');
  await expect(page.locator('.product-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Kebaplar', exact: true }).click();
  await expect(page.getByRole('searchbox')).toHaveValue('');
  await expect(page.locator('.product-card')).toHaveCount(9);
});

test('a failed menu request can be retried without reloading the page', async ({ page }) => {
  let requests = 0;
  await page.route('**/menu.json', async (route) => {
    requests += 1;
    if (requests === 1) await route.fulfill({ status: 503, body: 'Unavailable' });
    else await route.continue();
  });
  await page.goto('/');
  await expect(page.locator('#menu-status')).toContainText('Menümüz şu an yüklenemedi');
  await page.getByRole('button', { name: 'Tekrar dene' }).click();
  await expect(page.locator('.product-card')).toHaveCount(6);
  expect(requests).toBe(2);
});

test('menu fits small phones, tablets and desktop, with keyboard navigation', async ({ page }) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.locator('.product-card')).toHaveCount(6);
    const dimensions = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(dimensions.scroll, `${width}px viewport has horizontal overflow`).toBeLessThanOrEqual(dimensions.client);
  }
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Menüye geç' })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'İçecekler', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#category-title')).toHaveText('İçecekler');
  await expect(page.locator('.product-card')).toHaveCount(8);
});
