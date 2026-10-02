import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parsePrice, formatAmount } from '../../assets/shared.js';

const original = JSON.parse(readFileSync(new URL('../../menu.json', import.meta.url), 'utf8'));
const originalPrice = (name) => parsePrice(Object.values(original).flat().find(product => product.isim === name).fiyat);
const copy = (value) => JSON.parse(JSON.stringify(value));
const DRAFT = 'kurt-kebap-menu-draft-v1';
const API = 'https://api.github.com/repos/emrekrt221-ship-it/qr_menu';
const TOKEN = 'github_pat_browser_test_only_do_not_store';
const CREATED_TREE = '5'.repeat(40);
const CREATED_COMMIT = '6'.repeat(40);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1kAAAAASUVORK5CYII=', 'base64');

async function openAdmin(page) {
  await page.goto('/admin.html');
  await expect(page.locator('.editor-row')).toHaveCount(47);
}
async function draft(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), DRAFT);
}
async function connect(page) {
  await page.locator('#github-token').fill(TOKEN);
  await page.locator('#connect-button').click();
  await expect(page.locator('#connection-label')).toHaveText('GitHub bağlı');
  await expect(page.locator('#connect-button')).not.toBeVisible();
  await expect(page.locator('#add-product')).toBeEnabled();
}
async function uploadPhoto(page, name = 'Patlıcan Kebabı') {
  await page.getByRole('button', { name: `${name} düzenle`, exact: true }).click();
  await page.locator('#photo-file').setInputFiles({ name: 'tiny.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('#photo-status')).toContainText('Fotoğraf hazır');
  await expect(page.locator('#product-photo')).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
  await page.locator('#save-product').click();
  await expect(page.locator('#product-dialog')).not.toBeVisible();
}

// All API traffic is intercepted; these tests never write to a real GitHub repository.
async function mockGitHub(page, options = {}) {
  const state = { menu: copy(original), sha: 'a'.repeat(40), head: '1'.repeat(40), tree: '2'.repeat(40), calls: [], blobs: [], trees: [], commits: [], patches: [], applied: false, ...options };
  await page.route(`${API}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/repos/emrekrt221-ship-it/qr_menu', '');
    const method = request.method();
    const body = request.postDataJSON();
    state.calls.push({ path, method, body });
    expect(request.headers().authorization).toBe(`Bearer ${TOKEN}`);
    const reply = (json, status = 200) => route.fulfill({ status, json });
    if (method === 'GET' && state.applied && state.verificationBlocked) return route.abort('failed');
    if (method === 'GET' && path === '/git/ref/heads/main') return reply({ object: { sha: state.head } });
    if (method === 'GET' && path === `/git/commits/${state.head}`) return reply({ tree: { sha: state.tree } });
    if (method === 'GET' && path === '/contents/menu.json') {
      expect(url.searchParams.get('ref')).toBe(state.head);
      return reply({ sha: state.sha, encoding: 'base64', content: Buffer.from(JSON.stringify(state.menu), 'utf8').toString('base64') });
    }
    if (method === 'POST' && path === '/git/blobs') {
      const sha = String(state.blobs.length + 3).repeat(40);
      state.blobs.push({ sha, ...body });
      return reply({ sha }, 201);
    }
    if (method === 'POST' && path === '/git/trees') {
      state.trees.push(body);
      expect(body.base_tree).toBe(state.tree);
      return reply({ sha: CREATED_TREE }, 201);
    }
    if (method === 'POST' && path === '/git/commits') {
      state.commits.push(body);
      expect(body.parents).toEqual([state.head]);
      expect(body.tree).toBe(CREATED_TREE);
      return reply({ sha: CREATED_COMMIT }, 201);
    }
    if (method === 'PATCH' && path === '/git/refs/heads/main') {
      state.patches.push(body);
      expect(body).toEqual({ sha: CREATED_COMMIT, force: false });
      if (state.holdRef) await state.holdRef;
      if (state.refFailure) return reply({ message: 'Reference advanced' }, state.refFailure);
      state.applied = true;
      const menuBlob = state.blobs.findLast((blob) => blob.encoding === 'utf-8');
      state.menu = JSON.parse(menuBlob.content);
      state.sha = menuBlob.sha;
      state.head = CREATED_COMMIT;
      state.tree = CREATED_TREE;
      if (state.abortAfterApply) return route.abort('failed');
      return reply({ object: { sha: CREATED_COMMIT } });
    }
    throw new Error(`Unexpected GitHub request: ${method} ${path}`);
  });
  return state;
}

test.beforeEach(async ({ page, context }) => {
  await context.route('**/menu.json*', (route) => route.fulfill({ json: original }));
  await page.route('https://images.unsplash.com/**', (route) => route.abort());
});

test('offline price edit restores its draft and preview without changing the live menu', async ({ page, context }) => {
  await openAdmin(page);
  await page.getByRole('textbox', { name: 'Patlıcan Kebabı fiyatı (TL)', exact: true }).fill('375,50');
  await expect(page.locator('#save-status')).toContainText('1 ürün değişikliği');
  await expect(page.locator('#publish-button')).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Patlıcan Kebabı fiyatı (TL)', exact: true })).toHaveValue('375,5');
  await expect(page.locator('#notice')).toContainText('Önceki taslağınız');
  await page.locator('#preview-button').click();
  const preview = page.frameLocator('#preview-frame');
  await expect(preview.locator('#preview-banner')).toBeVisible();
  await expect(preview.locator('.product-card').filter({ hasText: 'Patlıcan Kebabı' }).locator('.product-price')).toContainText('375,5');
  const live = await context.newPage();
  await live.goto('/');
  await expect(live.locator('.product-card').filter({ hasText: 'Patlıcan Kebabı' }).locator('.product-price')).toHaveText(`${formatAmount(originalPrice('Patlıcan Kebabı'))}₺`);
});

test('category bulk changes apply to hidden products, and hiding is reflected only in preview', async ({ page }) => {
  await openAdmin(page);
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('checkbox', { name: 'Kutu Kola menüde göster', exact: true }).uncheck();
  await page.getByText('Toplu fiyat güncelle', { exact: true }).click();
  await page.locator('#bulk-category').selectOption('İçecekler');
  await page.locator('#bulk-mode').selectOption('amount');
  await page.locator('#bulk-value').fill('5');
  await page.getByRole('button', { name: 'Fiyatları uygula' }).click();
  await expect(page.locator('#notice')).toContainText('8 ürünün fiyatı');
  await expect(page.getByRole('textbox', { name: 'Kutu Kola fiyatı (TL)', exact: true })).toHaveValue(formatAmount(originalPrice('Kutu Kola') + 5));
  await expect(page.getByRole('textbox', { name: 'Et Hamburger fiyatı (TL)', exact: true })).toHaveValue(formatAmount(originalPrice('Et Hamburger')));
  await page.locator('#preview-button').click();
  const preview = page.frameLocator('#preview-frame');
  await preview.getByRole('button', { name: 'İçecekler', exact: true }).click();
  await expect(preview.locator('.product-card')).toHaveCount(7);
  await expect(preview.getByRole('heading', { name: 'Kutu Kola', exact: true })).toHaveCount(0);
  await expect(preview.locator('.product-card').filter({ hasText: 'Küçük Ayran' }).locator('.product-price')).toHaveText(`${formatAmount(originalPrice('Küçük Ayran') + 5)}₺`);
});

test('new products can be added and moved between categories, with invalid prices rejected', async ({ page }) => {
  await openAdmin(page);
  await page.locator('#add-product').click();
  await page.locator('#product-name').fill('Deneme Tabağı');
  await page.locator('#product-category').fill('Mezeler');
  await page.locator('#product-description').fill('Taze hazırlanır.');
  await page.locator('#product-price').fill('-10');
  await page.locator('#save-product').click();
  await expect(page.locator('#product-error')).toContainText('geçerli bir fiyat');
  await expect(page.locator('.editor-row')).toHaveCount(47);
  await page.locator('#product-price').fill('125,50');
  await page.locator('#save-product').click();
  await expect(page.locator('.editor-row')).toHaveCount(48);
  await page.getByRole('button', { name: 'Deneme Tabağı düzenle', exact: true }).click();
  await page.locator('#product-name').fill('Günün Tabağı');
  await page.locator('#product-category').fill('Porsiyonlar');
  await page.locator('#product-price').fill('140');
  await page.locator('#save-product').click();
  const stored = await draft(page);
  expect(stored.menu.Mezeler.some((product) => product.isim === 'Deneme Tabağı')).toBe(false);
  expect(stored.menu.Porsiyonlar.find((product) => product.isim === 'Günün Tabağı')).toMatchObject({ aciklama: 'Taze hazırlanır.', fiyat: '140 TL' });
});

test('uploaded photo persists across reload and renders as the actual image in draft preview', async ({ page }) => {
  await openAdmin(page);
  await uploadPhoto(page);
  const stored = await draft(page);
  const path = stored.menu.Kebaplar[0].resim;
  expect(path).toMatch(/^images\/upload-[a-f0-9-]+\.jpg$/);
  expect(stored.images[path].dataURL).toMatch(/^data:image\/jpeg;base64,/);
  await page.reload();
  await expect(page.locator('.editor-row').filter({ hasText: 'Patlıcan Kebabı' }).locator('img')).toHaveAttribute('src', stored.images[path].dataURL);
  await page.locator('#preview-button').click();
  const photo = page.frameLocator('#preview-frame').getByRole('img', { name: 'Patlıcan Kebabı', exact: true });
  await expect(photo).toHaveAttribute('src', stored.images[path].dataURL);
  await expect.poll(() => photo.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
});

test('invalid inline prices block preview and publication without overwriting the saved draft', async ({ page }) => {
  await mockGitHub(page);
  await openAdmin(page);
  await connect(page);
  const price = page.getByRole('textbox', { name: 'Patlıcan Kebabı fiyatı (TL)', exact: true });
  await price.fill('375');
  await price.fill('1000001');
  await expect(price).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#preview-button')).toBeDisabled();
  await expect(page.locator('#publish-button')).toBeDisabled();
  expect((await draft(page)).menu.Kebaplar[0].fiyat).toBe('375 TL');
  await price.fill('400');
  await expect(page.locator('#preview-button')).toBeEnabled();
  await expect(page.locator('#publish-button')).toBeEnabled();
});

test('publication commits photos and menu atomically and reports success only after the ref update', async ({ page }) => {
  let releaseRef;
  const holdRef = new Promise((resolve) => { releaseRef = resolve; });
  const state = await mockGitHub(page, { holdRef });
  await openAdmin(page);
  await connect(page);
  await page.getByRole('textbox', { name: 'Patlıcan Kebabı fiyatı (TL)', exact: true }).fill('425');
  await uploadPhoto(page);
  await page.locator('#preview-button').click();
  await page.locator('#close-preview').click();
  const stored = await draft(page);
  const imagePath = stored.menu.Kebaplar[0].resim;
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(storage).not.toContain(TOKEN);
  await expect(page.locator('#github-token')).toHaveValue('');
  await page.locator('#publish-button').click();
  await expect.poll(() => state.patches.length).toBe(1);
  expect(state.applied).toBe(false);
  await expect(page.locator('#save-status')).toHaveText('İşlem sürüyor…');
  await expect(page.locator('#notice')).not.toContainText('GitHub\'a kaydedildi');
  expect(state.blobs).toHaveLength(2);
  expect(state.blobs[0].encoding).toBe('base64');
  expect(state.blobs[0].content).toBe(stored.images[imagePath].dataURL.split(',')[1]);
  expect(state.blobs[1].encoding).toBe('utf-8');
  expect(JSON.parse(state.blobs[1].content).Kebaplar[0]).toMatchObject({ fiyat: '425 TL', resim: imagePath });
  expect(state.trees).toHaveLength(1);
  expect(state.trees[0].tree).toEqual([
    { path: imagePath, mode: '100644', type: 'blob', sha: '3'.repeat(40) },
    { path: 'menu.json', mode: '100644', type: 'blob', sha: '4'.repeat(40) },
  ]);
  expect(state.commits).toHaveLength(1);
  releaseRef();
  await expect(page.locator('#notice')).toContainText('Menü ve fotoğraflar GitHub\'a kaydedildi');
  expect(state.applied).toBe(true);
  await expect(page.locator('#save-status')).toHaveText('Tüm değişiklikler kayıtlı');
  await expect(page.locator('#publish-button')).toBeDisabled();
  const saved = await draft(page);
  expect(saved.baselineSha).toBe('4'.repeat(40));
  expect(saved.images).toEqual({});
  expect(saved.menu).toEqual(saved.baseline);
  await page.route('**/menu.json*', (route) => route.fulfill({ json: state.menu }));
  await page.reload();
  await expect(page.locator('#connection-label')).toHaveText('Bağlı değil');
  await expect(page.getByRole('textbox', { name: 'Patlıcan Kebabı fiyatı (TL)', exact: true })).toHaveValue('425');
});

test('a changed remote menu blocks all commit writes and preserves local edits', async ({ page }) => {
  const state = await mockGitHub(page);
  await openAdmin(page);
  await connect(page);
  await page.getByRole('textbox', { name: 'Patlıcan Kebabı fiyatı (TL)', exact: true }).fill('450');
  state.menu.Kebaplar[0].fiyat = '500 TL';
  state.sha = 'other-menu-blob';
  state.head = 'other-head';
  await page.locator('#publish-button').click();
  await expect(page.locator('#notice')).toContainText('Üzerine yazılmadı; taslağınız korundu');
  expect(state.calls.filter((call) => call.method !== 'GET')).toEqual([]);
  expect((await draft(page)).menu.Kebaplar[0].fiyat).toBe('450 TL');
  await expect(page.locator('#save-status')).toContainText('1 ürün değişikliği');
});

test('a ref conflict preserves both edited menu and uploaded photo for retry', async ({ page }) => {
  const state = await mockGitHub(page, { refFailure: 409 });
  await openAdmin(page);
  await connect(page);
  await uploadPhoto(page);
  const before = await draft(page);
  await page.locator('#publish-button').click();
  await expect(page.locator('#notice')).toContainText('eşzamanlı bir değişiklik');
  expect(state.applied).toBe(false);
  expect(state.patches).toHaveLength(1);
  const after = await draft(page);
  expect(after.menu).toEqual(before.menu);
  expect(after.images).toEqual(before.images);
  expect(after.baselineSha).toBe('a'.repeat(40));
  await expect(page.locator('#publish-button')).toBeEnabled();
});

test('an invalid price survives search, category changes and reload until it is corrected', async ({ page }) => {
  await mockGitHub(page);
  await openAdmin(page);
  await connect(page);
  const price = page.getByRole('textbox', { name: 'Patlıcan Kebabı fiyatı (TL)', exact: true });
  await price.fill('375');
  await price.fill('gecersiz');
  await page.locator('#search').fill('kola');
  await expect(page.locator('#preview-button')).toBeDisabled();
  await expect(page.locator('#publish-button')).toBeDisabled();
  await page.locator('#search').fill('');
  await page.locator('#category-filter').selectOption('İçecekler');
  await expect(page.locator('#preview-button')).toBeDisabled();
  await page.locator('#category-filter').selectOption('Kebaplar');
  await expect(price).toHaveValue('gecersiz');
  await expect(price).toHaveAttribute('aria-invalid', 'true');
  await page.reload();
  await expect(price).toHaveValue('gecersiz');
  await expect(page.locator('#preview-button')).toBeDisabled();
  await expect(page.locator('#connect-button')).toBeDisabled();
  expect((await draft(page)).menu.Kebaplar[0].fiyat).toBe('375 TL');
  await price.fill('400');
  await expect(page.locator('#preview-button')).toBeEnabled();
  await expect(page.locator('#connect-button')).toBeEnabled();
  expect((await draft(page)).rawPrices).toEqual({});
  await connect(page);
  await expect(page.locator('#publish-button')).toBeEnabled();
});

test('a lost successful ref response is verified remotely before reporting publication success', async ({ page }) => {
  const state = await mockGitHub(page, { abortAfterApply: true });
  await openAdmin(page);
  await connect(page);
  await page.getByRole('textbox', { name: 'Patlıcan Kebabı fiyatı (TL)', exact: true }).fill('475');
  await page.locator('#publish-button').click();
  await expect(page.locator('#notice')).toContainText('Menü ve fotoğraflar GitHub\'a kaydedildi');
  expect(state.applied).toBe(true);
  expect(state.patches).toHaveLength(1);
  expect(state.commits).toHaveLength(1);
  const refPosition = state.calls.findIndex((call) => call.method === 'PATCH');
  expect(state.calls.slice(refPosition + 1).map((call) => call.path)).toEqual([
    '/git/ref/heads/main', `/git/commits/${CREATED_COMMIT}`, '/contents/menu.json',
  ]);
  const saved = await draft(page);
  expect(saved.pendingPublish).toBeNull();
  expect(saved.menu).toEqual(saved.baseline);
  await expect(page.locator('#publish-button')).toBeDisabled();
});

test('an unresolved successful publication is recovered from its persisted receipt on reconnect', async ({ page }) => {
  const state = await mockGitHub(page, { abortAfterApply: true, verificationBlocked: true });
  await openAdmin(page);
  await connect(page);
  await uploadPhoto(page);
  await page.locator('#publish-button').click();
  await expect(page.locator('#notice')).toContainText('Kaydetme yanıtı alınamadı');
  expect(state.applied).toBe(true);
  const pending = await draft(page);
  expect(pending.pendingPublish).toMatchObject({ commitSha: CREATED_COMMIT, menuSha: '4'.repeat(40), menu: state.menu });
  expect(Object.keys(pending.images)).toHaveLength(1);
  expect(pending.menu).not.toEqual(pending.baseline);
  await page.reload();
  await expect(page.locator('#connection-label')).toHaveText('Bağlı değil');
  expect((await draft(page)).pendingPublish).toEqual(pending.pendingPublish);
  state.verificationBlocked = false;
  await connect(page);
  await expect(page.locator('#notice')).toContainText('Menü ve fotoğraflar GitHub\'a kaydedildi');
  await expect(page.locator('#save-status')).toHaveText('Tüm değişiklikler kayıtlı');
  const recovered = await draft(page);
  expect(recovered.pendingPublish).toBeNull();
  expect(recovered.images).toEqual({});
  expect(recovered.baselineSha).toBe('4'.repeat(40));
  expect(recovered.menu).toEqual(state.menu);
  expect(recovered.baseline).toEqual(state.menu);
  expect(state.commits).toHaveLength(1);
  expect(state.patches).toHaveLength(1);
});

test('editing whitespace around an uploaded photo path preserves its pending image data', async ({ page }) => {
  await openAdmin(page);
  await page.getByRole('button', { name: 'Patlıcan Kebabı düzenle', exact: true }).click();
  await page.locator('#photo-file').setInputFiles({ name: 'tiny.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('#photo-status')).toContainText('Fotoğraf hazır');
  const path = await page.locator('#product-image').inputValue();
  const source = await page.locator('#product-photo').getAttribute('src');
  await page.locator('#product-image').fill(` ${path} `);
  await page.locator('#product-image').fill(path);
  await expect(page.locator('#product-photo')).toHaveAttribute('src', source);
  await page.locator('#save-product').click();
  const stored = await draft(page);
  expect(stored.menu.Kebaplar[0].resim).toBe(path);
  expect(stored.images[path].dataURL).toBe(source);
  await page.locator('#preview-button').click();
  await expect(page.frameLocator('#preview-frame').getByRole('img', { name: 'Patlıcan Kebabı', exact: true })).toHaveAttribute('src', source);
});
